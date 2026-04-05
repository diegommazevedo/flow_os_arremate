/**
 * PaymentRecoveryBot — FlowOS v4
 *
 * Agente de recuperação de pagamento com escalonamento BullMQ.
 * Orquestra 6 camadas de alerta calculadas a partir de `paymentDeadline`,
 * com interfaces injetáveis para testabilidade sem infra real.
 *
 * Invariantes:
 *   [SEC-06] Toda ação registrada no AuditLog (immutable)
 *   [SEC-08] Nunca logar PII completo — apenas fragmentos mascarados
 */

import crypto from "node:crypto";
import { type Queue, type Worker, type Job, type JobsOptions } from "bullmq";
import { db, InternalMessageType } from "@flow-os/db";

// ─────────────────────────────────────────────────────────────────────────────
// §1  TIPOS DE INPUT E OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

/** Input tipado exigido pelo bot */
export interface PaymentRecoveryInput {
  dealId: string;
  paymentDeadline: Date;    // vencimento do prazo de pagamento
  actorPhone: string;       // WhatsApp / SMS do ator externo
  actorEmail: string;       // email do ator externo
  dealValue: number;        // valor do deal (R$)
  actorName: string;        // nome do ator externo
  paymentUrl?: string;      // link direto para o pagamento
  ownerPhone?: string;      // phone do OWNER (notificações críticas)
  ownerRocketUserId?: string; // user ID no Rocket.Chat do gestor principal
  workspaceId?: string;
}

export type AlertChannel =
  | "whatsapp"
  | "email"
  | "sms"
  | "rocket_chat"
  | "portal"
  | "owner_dm";

/** Log append-only de cada alerta enviado — persiste no banco [SEC-06] */
export interface PaymentAlert {
  id: string;
  dealId: string;
  channel: AlertChannel;
  hoursLeft: number;        // horas restantes quando o alert foi disparado
  sentAt: Date;
  delivered: boolean;
  jobName: string;
  error?: string;
}

export type NotificationResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

// Resultado de schedule
export interface ScheduleResult {
  dealId: string;
  jobsScheduled: number;
  jobIds: string[];
  firstTriggerAt?: Date;
}

// Resultado de cancel
export interface CancelResult {
  dealId: string;
  jobsCancelled: number;
  jobIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §2  PASSOS DE ESCALONAMENTO
// ─────────────────────────────────────────────────────────────────────────────

export interface EscalationStep {
  /** Horas antes do vencimento para disparar (0 = no momento do vencimento) */
  hoursBeforeDeadline: number;
  /** Canais ativos neste passo */
  channels: AlertChannel[];
  /** Nome do job BullMQ */
  jobName: string;
  /** Reclassifica deal para Q1_FACA_AGORA no Eisenhower */
  reclassifyToQ1?: boolean;
  /** Adiciona flag CRÍTICO no dashboard */
  flagCritical?: boolean;
  /** Cria entrada no relatório de perdas */
  createLossReport?: boolean;
  /** Marca paymentStatus=VENCIDO */
  markExpired?: boolean;
  /** Texto descritivo do passo */
  description: string;
}

export const ESCALATION_STEPS: EscalationStep[] = [
  {
    hoursBeforeDeadline: 48,
    channels: ["whatsapp", "portal"],
    jobName: "payment_alert_48h",
    description: "WhatsApp (template Meta aprovado) + notificação portal",
  },
  {
    hoursBeforeDeadline: 24,
    channels: ["email", "whatsapp"],
    jobName: "payment_alert_24h",
    reclassifyToQ1: true,
    description: "Email (Resend) + WhatsApp + reclassifica Q1_FACA_AGORA",
  },
  {
    hoursBeforeDeadline: 6,
    channels: ["whatsapp"],
    jobName: "payment_alert_6h",
    description: "WhatsApp com link direto do pagamento + PDF mini-tutorial",
  },
  {
    hoursBeforeDeadline: 2,
    channels: ["sms", "rocket_chat"],
    jobName: "payment_alert_2h",
    description: "SMS (fallback) + alerta #gestores Rocket.Chat com badge URGENTE",
  },
  {
    hoursBeforeDeadline: 1,
    channels: ["owner_dm"],
    jobName: "payment_alert_1h",
    flagCritical: true,
    description: "DM para OWNER + flag CRÍTICO no dashboard",
  },
  {
    hoursBeforeDeadline: 0,
    channels: [],
    jobName: "payment_expired",
    markExpired: true,
    createLossReport: true,
    description: "paymentStatus=VENCIDO + relatório de perdas + notifica OWNER",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// §3  INTERFACES INJETÁVEIS
// ─────────────────────────────────────────────────────────────────────────────

export interface WhatsAppClient {
  /** Envia template aprovado Meta */
  sendTemplate(
    to: string,
    templateName: string,
    params: string[],
  ): Promise<NotificationResult>;
  /** Envia mensagem de texto livre */
  sendText(to: string, message: string): Promise<NotificationResult>;
  /** Envia documento (PDF / tutorial) */
  sendDocument(
    to: string,
    documentUrl: string,
    caption: string,
  ): Promise<NotificationResult>;
}

export interface EmailClient {
  send(params: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
  }): Promise<NotificationResult>;
}

export interface SmsClient {
  send(to: string, message: string): Promise<NotificationResult>;
}

export interface RocketChatClient {
  postToChannel(
    channel: string,
    message: string,
    attachments?: RocketAttachment[],
  ): Promise<NotificationResult>;
  sendDirectMessage(
    userId: string,
    message: string,
  ): Promise<NotificationResult>;
}

export interface RocketAttachment {
  title: string;
  text: string;
  color: string;
  fields?: Array<{ title: string; value: string; short: boolean }>;
}

export interface PortalNotifier {
  push(
    dealId: string,
    message: string,
    type: "info" | "warning" | "critical",
  ): Promise<void>;
}

/** Operações no deal que o bot precisa executar */
export interface DealRepository {
  setPaymentStatus(dealId: string, status: "PAGO" | "VENCIDO" | "CANCELADO"): Promise<void>;
  setEisenhowerQ1(dealId: string, reason: string): Promise<void>;
  flagCritical(dealId: string, isCritical: boolean): Promise<void>;
  createLossEntry(params: {
    dealId: string;
    reason: string;
    dealValue: number;
    expiredAt: Date;
  }): Promise<void>;
  getPaymentStatus(dealId: string): Promise<string | null>;
}

/** Repositório de alertas enviados — usado para de-duplicação e auditoria */
export interface AlertRepository {
  save(alert: PaymentAlert): Promise<void>;
  /** Retorna true se já existe alerta para o mesmo deal+channel+hoursLeft */
  existsForInterval(
    dealId: string,
    channel: AlertChannel,
    hoursLeft: number,
  ): Promise<boolean>;
  findByDeal(dealId: string): Promise<PaymentAlert[]>;
}

/** Abstração da Queue BullMQ para testabilidade */
export interface IQueue {
  addJob(
    name: string,
    data: PaymentJobData,
    opts: { delay: number; jobId: string; attempts?: number; removeOnComplete?: boolean },
  ): Promise<void>;
  removeJob(jobId: string): Promise<boolean>;
}

export interface AuditWriter {
  log(entry: {
    action: string;
    actorId: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
    severity?: "info" | "warning" | "critical";
  }): Promise<void>;
}

/** Todas as dependências injetáveis do bot */
export interface PaymentRecoveryDeps {
  queue: IQueue;
  whatsapp: WhatsAppClient;
  email: EmailClient;
  sms: SmsClient;
  rocketChat: RocketChatClient;
  portalNotifier: PortalNotifier;
  dealRepo: DealRepository;
  alertRepo: AlertRepository;
  auditWriter: AuditWriter;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  PAYLOAD DO JOB (serializado no BullMQ / Redis)
// ─────────────────────────────────────────────────────────────────────────────

/** Tudo que o worker precisa para processar um passo sem buscar no banco */
export interface PaymentJobData {
  dealId: string;
  paymentDeadlineIso: string; // ISO string — Date não serializa em JSON
  actorPhone: string;
  actorEmail: string;
  dealValue: number;
  actorName: string;
  paymentUrl?: string;
  ownerPhone?: string;
  ownerRocketUserId?: string;
  workspaceId?: string;
  step: {
    hoursBeforeDeadline: number;
    channels: AlertChannel[];
    jobName: string;
    reclassifyToQ1?: boolean;
    flagCritical?: boolean;
    createLossReport?: boolean;
    markExpired?: boolean;
    description: string;
  };
  scheduledFor: string;       // ISO string do horário de disparo planejado
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Job ID determinístico — permite cancel sem manter estado externo */
function buildJobId(dealId: string, jobName: string): string {
  return `payment:${dealId}:${jobName}`;
}

/** Mascara PII para logs — [SEC-08] */
function maskPhone(phone: string): string {
  return phone.length > 6
    ? `${phone.slice(0, 3)}****${phone.slice(-2)}`
    : "***";
}
function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***@***";
  return `${user.slice(0, 2)}***@${domain}`;
}

/** Formata valor em BRL para mensagens */
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

async function notifyPriorityChannel(
  workspaceId: string | undefined,
  dealId: string,
  motivo: string,
): Promise<void> {
  if (!workspaceId) return;

  const channel = await db.internalChannel.findFirst({
    where: { workspaceId, nome: "alertas-q1" },
    select: { id: true },
  });

  if (!channel) return;

  await db.internalMessage.create({
    data: {
      workspaceId,
      channelId: channel.id,
      autorId: "SISTEMA",
      tipo: InternalMessageType.ALERTA_Q1,
      dealId,
      conteudo: `ALERTA Q1 - ${motivo}`,
    },
  });
}

/** Constrói a mensagem WhatsApp para um dado passo */
function buildWhatsAppMessage(
  step: EscalationStep,
  input: PaymentJobData,
): string {
  const h = step.hoursBeforeDeadline;
  const name = input.actorName.split(" ")[0];
  const deadline = new Date(input.paymentDeadlineIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const value = formatBRL(input.dealValue);

  if (h === 48) {
    return (
      `Olá ${name}! 👋 Lembrete: o prazo de pagamento do seu negócio ` +
      `(${value}) vence em *48 horas* — ${deadline}. ` +
      `Pague pelo app do banco, internet banking ou canal designado. ` +
      `Dúvidas? Responda esta mensagem.`
    );
  }
  if (h === 24) {
    return (
      `⚠️ ${name}, faltam *24 horas* para o vencimento do pagamento (${value}). ` +
      `Vence em: ${deadline}. ` +
      `${input.paymentUrl ? `Acesse o pagamento aqui: ${input.paymentUrl}` : "Seu consultor já tem o link disponível."} ` +
      `Qualquer dificuldade, nos avise agora!`
    );
  }
  if (h === 6) {
    return (
      `🚨 *ATENÇÃO, ${name}!* Faltam apenas *6 horas* para o vencimento ` +
      `do pagamento (${value}). ` +
      `${input.paymentUrl ? `🔗 Link direto: ${input.paymentUrl}` : ""} ` +
      `Enviamos também o mini-tutorial de pagamento. Precisa de ajuda? Responda AGORA.`
    );
  }
  return (
    `🔴 ${name}, pagamento vence em ${h}h! (${value}) — ${deadline}. ` +
    `Entre em contato imediatamente.`
  );
}

function buildEmailHtml(step: EscalationStep, input: PaymentJobData): string {
  const deadline = new Date(input.paymentDeadlineIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const value = formatBRL(input.dealValue);
  const h = step.hoursBeforeDeadline;

  return `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
  <div style="background:#ef4444;color:#fff;padding:16px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">⚠️ Prazo de pagamento em ${h} horas</h2>
  </div>
  <div style="border:1px solid #e5e7eb;padding:20px;border-radius:0 0 8px 8px">
    <p>Olá, <strong>${input.actorName}</strong></p>
    <p>Seu prazo de pagamento no valor de <strong>${value}</strong> vence em:</p>
    <p style="font-size:24px;font-weight:bold;color:#ef4444;text-align:center">${deadline}</p>
    ${
      input.paymentUrl
        ? `<div style="text-align:center;margin:24px 0">
             <a href="${input.paymentUrl}" style="background:#3b82f6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
               Acessar Pagamento
             </a>
           </div>`
        : "<p>Solicite o link de pagamento diretamente ao seu consultor.</p>"
    }
    <p>Formas de pagamento: <strong>App do banco, internet banking ou canal designado.</strong></p>
    <hr style="border:none;border-top:1px solid #e5e7eb">
    <p style="font-size:12px;color:#6b7280">
      FlowOS. Não responda este e-mail diretamente.
    </p>
  </div>
</body></html>`;
}

function buildSmsMessage(input: PaymentJobData): string {
  const h = input.step.hoursBeforeDeadline;
  return (
    `URGENTE: Pagamento ${formatBRL(input.dealValue)} vence em ${h}h. ` +
    `${input.paymentUrl ? `Link: ${input.paymentUrl}` : "Contate seu consultor."}`
  );
}

function buildRocketChatMessage(input: PaymentJobData): {
  message: string;
  attachments: RocketAttachment[];
} {
  const deadline = new Date(input.paymentDeadlineIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  return {
    message: `🔴 *PAGAMENTO URGENTE — ${input.step.hoursBeforeDeadline}h restantes*`,
    attachments: [
      {
        title: `Deal ${input.dealId} — ${input.actorName}`,
        text: `Pagamento de ${formatBRL(input.dealValue)} vence às ${deadline}`,
        color: "#ef4444",
        fields: [
          { title: "Deal ID",  value: input.dealId,            short: true },
          { title: "Valor",    value: formatBRL(input.dealValue), short: true },
          { title: "Vencimento", value: deadline,              short: false },
          {
            title: "Contato",
            value: maskPhone(input.actorPhone),
            short: true,
          },
        ],
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6  BOT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export class PaymentRecoveryBot {
  constructor(private readonly deps: PaymentRecoveryDeps) {}

  // ── §6.1  Agendar todos os jobs para um deal ─────────────────────────────

  async schedule(input: PaymentRecoveryInput): Promise<ScheduleResult> {
    const now = Date.now();
    const deadline = input.paymentDeadline.getTime();
    const jobIds: string[] = [];
    let jobsScheduled = 0;
    let firstTriggerAt: Date | undefined;

    for (const step of ESCALATION_STEPS) {
      const triggerAt = deadline - step.hoursBeforeDeadline * 3_600_000;
      const delay = triggerAt - now;

      // Pular steps cujo triggerAt já passou (margem de 1 minuto)
      if (delay < -60_000) {
        continue;
      }

      const id = buildJobId(input.dealId, step.jobName);
      const data: PaymentJobData = {
        dealId:             input.dealId,
        paymentDeadlineIso: input.paymentDeadline.toISOString(),
        actorPhone:         input.actorPhone,
        actorEmail:         input.actorEmail,
        dealValue:          input.dealValue,
        actorName:          input.actorName,
        scheduledFor:       new Date(triggerAt).toISOString(),
        ...(input.paymentUrl        ? { paymentUrl:        input.paymentUrl        } : {}),
        ...(input.ownerPhone        ? { ownerPhone:        input.ownerPhone        } : {}),
        ...(input.ownerRocketUserId ? { ownerRocketUserId: input.ownerRocketUserId } : {}),
        ...(input.workspaceId       ? { workspaceId:       input.workspaceId       } : {}),
        step: {
          hoursBeforeDeadline: step.hoursBeforeDeadline,
          channels:            step.channels,
          jobName:             step.jobName,
          description:         step.description,
          ...(step.reclassifyToQ1  !== undefined ? { reclassifyToQ1:  step.reclassifyToQ1  } : {}),
          ...(step.flagCritical    !== undefined ? { flagCritical:    step.flagCritical    } : {}),
          ...(step.createLossReport !== undefined ? { createLossReport: step.createLossReport } : {}),
          ...(step.markExpired     !== undefined ? { markExpired:     step.markExpired     } : {}),
        },
      };

      await this.deps.queue.addJob(step.jobName, data, {
        delay:            Math.max(0, delay),
        jobId:            id,
        attempts:         3,
        removeOnComplete: true,
      });

      jobIds.push(id);
      jobsScheduled++;

      if (!firstTriggerAt || triggerAt < firstTriggerAt.getTime()) {
        firstTriggerAt = new Date(triggerAt);
      }
    }

    await this.deps.auditWriter.log({
      action:       "payment_recovery.scheduled",
      actorId:      "SYSTEM",
      resourceType: "Deal",
      resourceId:   input.dealId,
      severity:     "info",
      metadata: {
        jobsScheduled,
        paymentDeadline: input.paymentDeadline.toISOString(),
        maskedPhone:     maskPhone(input.actorPhone),
        maskedEmail:     maskEmail(input.actorEmail),
        dealValue:       input.dealValue,
      },
    });

    return {
      dealId: input.dealId,
      jobsScheduled,
      jobIds,
      ...(firstTriggerAt ? { firstTriggerAt } : {}),
    };
  }

  // ── §6.2  Cancelar todos os jobs quando pagamento é confirmado ──────────

  async markAsPaid(dealId: string): Promise<CancelResult> {
    const removed: string[] = [];

    for (const step of ESCALATION_STEPS) {
      const id = buildJobId(dealId, step.jobName);
      const ok = await this.deps.queue.removeJob(id);
      if (ok) removed.push(id);
    }

    await this.deps.dealRepo.setPaymentStatus(dealId, "PAGO");

    await this.deps.auditWriter.log({
      action:       "payment_recovery.paid_cancel",
      actorId:      "SYSTEM",
      resourceType: "Deal",
      resourceId:   dealId,
      severity:     "info",
      metadata: { jobsCancelled: removed.length, removedIds: removed },
    });

    return { dealId, jobsCancelled: removed.length, jobIds: removed };
  }

  // ── §6.3  Processar um job (chamado pelo Worker BullMQ) ──────────────────

  async processJob(data: PaymentJobData): Promise<void> {
    const { step, dealId } = data;

    // Verificar se pagamento já foi realizado — skip completo
    const currentStatus = await this.deps.dealRepo.getPaymentStatus(dealId);
    if (currentStatus === "PAGO") {
      console.log(`[PaymentRecoveryBot] Deal ${dealId} já pago — skip ${step.jobName}`);
      return;
    }

    // Processar cada canal com de-duplicação
    for (const channel of step.channels) {
      await this.sendChannel(channel, data, step.hoursBeforeDeadline);
    }

    // Ações estruturais do passo
    if (step.markExpired) {
      await this.handleExpiry(data);
    }
    if (step.reclassifyToQ1) {
      await this.deps.dealRepo.setEisenhowerQ1(
        dealId,
        `Prazo de pagamento em ${step.hoursBeforeDeadline}h — Q1_FACA_AGORA automático`,
      );
      await notifyPriorityChannel(
        data.workspaceId,
        dealId,
        `Prazo de pagamento em ${step.hoursBeforeDeadline}h`,
      );
      await this.deps.auditWriter.log({
        action:       "eisenhower.reclassify_q1",
        actorId:      "SYSTEM",
        resourceType: "Deal",
        resourceId:   dealId,
        severity:     "warning",
        metadata: { trigger: step.jobName, hoursLeft: step.hoursBeforeDeadline },
      });
    }
    if (step.flagCritical) {
      await this.deps.dealRepo.flagCritical(dealId, true);
      await this.deps.auditWriter.log({
        action:       "deal.flag_critical",
        actorId:      "SYSTEM",
        resourceType: "Deal",
        resourceId:   dealId,
        severity:     "critical",
        metadata: { trigger: step.jobName },
      });
    }
  }

  // ── §6.4  Despachar por canal ────────────────────────────────────────────

  private async sendChannel(
    channel: AlertChannel,
    data: PaymentJobData,
    hoursLeft: number,
  ): Promise<void> {
    // De-duplicação: nunca enviar 2x no mesmo canal para o mesmo intervalo
    const alreadySent = await this.deps.alertRepo.existsForInterval(
      data.dealId,
      channel,
      hoursLeft,
    );
    if (alreadySent) {
      console.warn(
        `[PaymentRecoveryBot] De-dup: ${channel} já enviado para deal ${data.dealId} em ${hoursLeft}h`,
      );
      return;
    }

    let result: NotificationResult;

    switch (channel) {
      case "whatsapp":
        result = await this.sendWhatsApp(data, hoursLeft);
        break;
      case "email":
        result = await this.sendEmail(data);
        break;
      case "sms":
        result = await this.sendSms(data);
        break;
      case "rocket_chat":
        result = await this.sendRocketChatAlert(data);
        break;
      case "portal":
        await this.sendPortalNotification(data, hoursLeft);
        result = { success: true };
        break;
      case "owner_dm":
        result = await this.sendOwnerDm(data);
        break;
      default:
        result = { success: false, error: `Canal desconhecido: ${channel as string}` };
    }

    // Persiste o alerta (auditoria + de-dup)
    const alert: PaymentAlert = {
      id:        crypto.randomUUID(),
      dealId:    data.dealId,
      channel,
      hoursLeft,
      sentAt:    new Date(),
      delivered: result.success,
      jobName:   data.step.jobName,
      ...(result.error ? { error: result.error } : {}),
    };
    await this.deps.alertRepo.save(alert);

    await this.deps.auditWriter.log({
      action:       `payment_alert.${channel}`,
      actorId:      "SYSTEM",
      resourceType: "Deal",
      resourceId:   data.dealId,
      severity:     hoursLeft <= 2 ? "critical" : hoursLeft <= 6 ? "warning" : "info",
      metadata: {
        alertId:     alert.id,
        hoursLeft,
        delivered:   result.success,
        messageId:   result.messageId,
        maskedPhone: maskPhone(data.actorPhone),
        maskedEmail: maskEmail(data.actorEmail),
        error:       result.error,
      },
    });
  }

  // ── §6.5  Implementações por canal ───────────────────────────────────────

  private async sendWhatsApp(
    data: PaymentJobData,
    hoursLeft: number,
  ): Promise<NotificationResult> {
    // 48h e 24h: template Meta aprovado (evita restrições de janela)
    if (hoursLeft === 48) {
      return this.deps.whatsapp.sendTemplate(
        data.actorPhone,
        "payment_deadline_48h",
        [
          data.actorName,
          formatBRL(data.dealValue),
          new Date(data.paymentDeadlineIso).toLocaleDateString("pt-BR"),
        ],
      );
    }

    if (hoursLeft === 24) {
      return this.deps.whatsapp.sendTemplate(
        data.actorPhone,
        "payment_deadline_24h",
        [
          data.actorName,
          formatBRL(data.dealValue),
          new Date(data.paymentDeadlineIso).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          }),
        ],
      );
    }

    if (hoursLeft === 6) {
      // Envia texto + documento (link pagamento + PDF tutorial) para máximo impacto
      const textResult = await this.deps.whatsapp.sendText(
        data.actorPhone,
        buildWhatsAppMessage(
          ESCALATION_STEPS.find((s) => s.hoursBeforeDeadline === 6)!,
          data,
        ),
      );
      if (data.paymentUrl) {
        await this.deps.whatsapp.sendDocument(
          data.actorPhone,
          data.paymentUrl,
          `Pagamento de ${formatBRL(data.dealValue)} — vence hoje`,
        );
      }
      return textResult;
    }

    // Demais casos: texto livre
    const step = ESCALATION_STEPS.find((s) => s.hoursBeforeDeadline === hoursLeft);
    return this.deps.whatsapp.sendText(
      data.actorPhone,
      step
        ? buildWhatsAppMessage(step, data)
        : `Pagamento vence em ${hoursLeft}h — ${formatBRL(data.dealValue)}`,
    );
  }

  private async sendEmail(data: PaymentJobData): Promise<NotificationResult> {
    const step = ESCALATION_STEPS.find(
      (s) => s.hoursBeforeDeadline === data.step.hoursBeforeDeadline,
    )!;
    return this.deps.email.send({
      to:      data.actorEmail,
      subject: `⚠️ Prazo de pagamento em ${data.step.hoursBeforeDeadline}h — ${formatBRL(data.dealValue)}`,
      html:    buildEmailHtml(step, data),
      from:    "alertas@flowos.com.br",
      replyTo: "atendimento@flowos.com.br",
    });
  }

  private async sendSms(data: PaymentJobData): Promise<NotificationResult> {
    return this.deps.sms.send(data.actorPhone, buildSmsMessage(data));
  }

  private async sendRocketChatAlert(
    data: PaymentJobData,
  ): Promise<NotificationResult> {
    const { message, attachments } = buildRocketChatMessage(data);
    return this.deps.rocketChat.postToChannel(
      "#gestores",
      message,
      attachments,
    );
  }

  private async sendPortalNotification(
    data: PaymentJobData,
    hoursLeft: number,
  ): Promise<void> {
    const type = hoursLeft <= 6 ? "critical" : hoursLeft <= 24 ? "warning" : "info";
    await this.deps.portalNotifier.push(
      data.dealId,
      `Pagamento vence em ${hoursLeft}h — ${formatBRL(data.dealValue)}`,
      type,
    );
  }

  private async sendOwnerDm(data: PaymentJobData): Promise<NotificationResult> {
    if (!data.ownerRocketUserId) {
      // Fallback: SMS para ownerPhone se não tiver Rocket.Chat ID
      if (data.ownerPhone) {
        return this.deps.sms.send(
          data.ownerPhone,
          `[URGENTE] Pagamento deal ${data.dealId} (${data.actorName}) vence em 1h!`,
        );
      }
      return { success: false, error: "ownerRocketUserId e ownerPhone ausentes" };
    }

    return this.deps.rocketChat.sendDirectMessage(
      data.ownerRocketUserId,
      `🔴 *CRÍTICO* — Pagamento do deal \`${data.dealId}\` (${data.actorName}) ` +
        `vence em *1 hora*!\n` +
        `Valor: ${formatBRL(data.dealValue)}\n` +
        `${data.paymentUrl ? `Link: ${data.paymentUrl}` : ""}`,
    );
  }

  // ── §6.6  Tratamento do vencimento (0h) ─────────────────────────────────

  private async handleExpiry(data: PaymentJobData): Promise<void> {
    const { dealId, dealValue } = data;

    await this.deps.dealRepo.setPaymentStatus(dealId, "VENCIDO");
    await this.deps.dealRepo.createLossEntry({
      dealId,
      reason: "Prazo de pagamento vencido sem confirmação",
      dealValue,
      expiredAt: new Date(data.paymentDeadlineIso),
    });

    // Notifica OWNER por ambos os canais disponíveis
    if (data.ownerPhone) {
      await this.deps.sms.send(
        data.ownerPhone,
        `[PERDA] Pagamento deal ${dealId} (${data.actorName}) VENCEU. ` +
          `${formatBRL(dealValue)} perdidos. Acione relatório.`,
      );
    }
    if (data.ownerRocketUserId) {
      await this.deps.rocketChat.sendDirectMessage(
        data.ownerRocketUserId,
        `💀 *PAGAMENTO VENCIDO*\n` +
          `Deal: \`${dealId}\`\n` +
          `Cliente: ${data.actorName}\n` +
          `Valor: ${formatBRL(dealValue)}\n` +
          `Venceu em: ${new Date(data.paymentDeadlineIso).toLocaleString("pt-BR")}`,
      );
    }

    await this.deps.auditWriter.log({
      action:       "payment_recovery.expired",
      actorId:      "SYSTEM",
      resourceType: "Deal",
      resourceId:   dealId,
      severity:     "critical",
      metadata: {
        dealValue,
        expiredAt:     data.paymentDeadlineIso,
        actorName:     data.actorName,
        maskedPhone:   maskPhone(data.actorPhone),
        lossReported:  true,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  ADAPTER BullMQ REAL (usa a Queue concreta)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper que adapta a Queue do BullMQ à interface IQueue.
 * Instancie com a Queue já configurada com a sua conexão Redis.
 *
 * @example
 * ```ts
 * import { Queue } from 'bullmq';
 * const queue = new Queue('payment-recovery', { connection: redisClient });
 * const adapter = new BullMQQueueAdapter(queue);
 * ```
 */
export class BullMQQueueAdapter implements IQueue {
  constructor(private readonly queue: Queue) {}

  async addJob(
    name: string,
    data: PaymentJobData,
    opts: { delay: number; jobId: string; attempts?: number; removeOnComplete?: boolean },
  ): Promise<void> {
    const jobOptions: JobsOptions = {
      delay:            opts.delay,
      jobId:            opts.jobId,
      attempts:         opts.attempts ?? 3,
      removeOnComplete: opts.removeOnComplete ?? true,
      backoff: { type: "exponential", delay: 5_000 },
    };
    await this.queue.add(name, data, jobOptions);
  }

  async removeJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    await job.remove();
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §8  ADAPTADORES CONCRETOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WhatsApp Meta API (Cloud API v20.0)
 * Requer: WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID nas envs
 */
export class WhatsAppMetaClient implements WhatsAppClient {
  private readonly baseUrl: string;

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
  ) {
    this.baseUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  }

  async sendTemplate(
    to: string,
    templateName: string,
    params: string[],
  ): Promise<NotificationResult> {
    return this.post({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name:     templateName,
        language: { code: "pt_BR" },
        components: params.length > 0
          ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }]
          : [],
      },
    });
  }

  async sendText(to: string, message: string): Promise<NotificationResult> {
    return this.post({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: message },
    });
  }

  async sendDocument(
    to: string,
    documentUrl: string,
    caption: string,
  ): Promise<NotificationResult> {
    return this.post({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { link: documentUrl, caption },
    });
  }

  private async post(body: unknown): Promise<NotificationResult> {
    try {
      const res = await fetch(this.baseUrl, {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return { success: false, error: JSON.stringify(json) };
      }
      const messages = json["messages"] as Array<{ id: string }> | undefined;
      const mid = messages?.[0]?.id;
      return { success: true, ...(mid ? { messageId: mid } : {}) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/**
 * Email via Resend
 * Requer: RESEND_API_KEY nas envs
 */
export class ResendEmailClient implements EmailClient {
  constructor(private readonly apiKey: string) {}

  async send(params: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
  }): Promise<NotificationResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:     params.from    ?? "alertas@flowos.com.br",
          reply_to: params.replyTo ?? "atendimento@flowos.com.br",
          to:       [params.to],
          subject:  params.subject,
          html:     params.html,
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return { success: false, error: JSON.stringify(json) };
      }
      const resendId = json["id"] as string | undefined;
      return { success: true, ...(resendId ? { messageId: resendId } : {}) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/**
 * Rocket.Chat via Webhook / REST API
 * Requer: ROCKETCHAT_BASE_URL e ROCKETCHAT_AUTH_TOKEN + USER_ID nas envs
 */
export class RocketChatWebhookClient implements RocketChatClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authToken: string,
    private readonly userId: string,
  ) {}

  async postToChannel(
    channel: string,
    message: string,
    attachments?: RocketAttachment[],
  ): Promise<NotificationResult> {
    return this.post("/api/v1/chat.postMessage", {
      channel,
      text: message,
      attachments: attachments?.map((a) => ({
        title:  a.title,
        text:   a.text,
        color:  a.color,
        fields: a.fields,
      })),
    });
  }

  async sendDirectMessage(
    userId: string,
    message: string,
  ): Promise<NotificationResult> {
    // Abrir canal DM primeiro
    const dmRes = await this.post("/api/v1/im.create", { username: userId });
    if (!dmRes.success) return dmRes;

    return this.post("/api/v1/chat.postMessage", {
      roomId: `@${userId}`,
      text:   message,
    });
  }

  private async post(path: string, body: unknown): Promise<NotificationResult> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method:  "POST",
        headers: {
          "X-Auth-Token":  this.authToken,
          "X-User-Id":     this.userId,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const rcId = (json["message"] as Record<string, string> | undefined)?.["_id"];
      return {
        success: res.ok && json["success"] === true,
        ...(rcId ? { messageId: rcId } : {}),
        ...(res.ok ? {} : { error: JSON.stringify(json) }),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §9  FACTORY — monta bot com deps concretas via variáveis de ambiente
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentRecoveryBotFactoryOptions {
  queue: IQueue;                // já configurado com conexão Redis
  dealRepo: DealRepository;     // adapter Prisma
  alertRepo: AlertRepository;   // adapter Prisma
  auditWriter: AuditWriter;     // adapter AuditLog
  portalNotifier: PortalNotifier; // adapter SSE / socket
  smsClient?: SmsClient;        // ex: Twilio, se houver
}

/**
 * Cria o PaymentRecoveryBot com adaptadores concretos para
 * WhatsApp Meta, Resend e Rocket.Chat lidos das variáveis de ambiente.
 */
export function createPaymentRecoveryBot(
  opts: PaymentRecoveryBotFactoryOptions,
): PaymentRecoveryBot {
  const whatsapp = new WhatsAppMetaClient(
    process.env["WHATSAPP_ACCESS_TOKEN"] ?? "",
    process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? "",
  );

  const email = new ResendEmailClient(process.env["RESEND_API_KEY"] ?? "");

  const rocketChat = new RocketChatWebhookClient(
    process.env["ROCKETCHAT_BASE_URL"] ?? "http://localhost:3000",
    process.env["ROCKETCHAT_AUTH_TOKEN"] ?? "",
    process.env["ROCKETCHAT_USER_ID"] ?? "",
  );

  const sms: SmsClient = opts.smsClient ?? {
    send: async (to, msg) => {
      console.warn(`[SMS-NOOP] SMS para ${maskPhone(to)}: ${msg.slice(0, 40)}...`);
      return { success: false, error: "SMS provider não configurado" };
    },
  };

  return new PaymentRecoveryBot({
    queue:          opts.queue,
    whatsapp,
    email,
    sms,
    rocketChat,
    portalNotifier: opts.portalNotifier,
    dealRepo:       opts.dealRepo,
    alertRepo:      opts.alertRepo,
    auditWriter:    opts.auditWriter,
  });
}

/**
 * Monta o Worker BullMQ que escuta a fila e delega ao PaymentRecoveryBot.
 * Deve ser iniciado em um processo separado (worker.ts) ou no mesmo processo.
 *
 * @example
 * ```ts
 * const worker = createPaymentWorker(redisConn, bot);
 * worker.on('completed', (job) => console.log('Job concluído', job.id));
 * ```
 */
export function createPaymentWorker(
  connection: ConstructorParameters<typeof Worker>[2] extends { connection: infer C } ? C : never,
  bot: PaymentRecoveryBot,
): Worker {
  // Import dinâmico para não forçar carregamento do Worker no ambiente de testes
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Worker: BullWorker } = require("bullmq") as typeof import("bullmq");

  return new BullWorker(
    "payment-recovery",
    async (job: Job<PaymentJobData>) => {
      await bot.processJob(job.data);
    },
    {
      connection,
      concurrency: 5,
    },
  );
}
