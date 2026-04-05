/**
 * Webhook Handler — Rocket.Chat Outgoing Webhook
 *
 * SLA: máx 500ms de resposta (exigência do Rocket.Chat)
 *
 * Estratégia de velocidade:
 *   - Etapas 1–8 síncronas com classificador rápido por keywords (< 50ms)
 *   - TokenRouter completo (LLM) executa em background via after()
 *   - Se cache Redis hit no TokenRouter: tudo síncrono < 100ms
 *
 * Invariantes:
 *   [SEC-01] HMAC SHA256 obrigatório — 401 sem assinatura válida
 *   [SEC-06] AuditLog append-only — toda ação registrada
 *   [SEC-08] InputSanitizer antes de qualquer chamada de IA
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { createHmac, timingSafeEqual } from "node:crypto";
import { after }           from "next/server";
import { db }              from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import type { EisenhowerQuadrant } from "@flow-os/db";
import { publishKanbanEvent }      from "@/lib/sse-bus";
import { Queue }                   from "bullmq";
import { REAL_ESTATE_CAIXA_TEMPLATE_ID, ROCKET_KEYWORD_RULES } from "@flow-os/templates";

// ─────────────────────────────────────────────────────────────────────────────
// §1  TIPOS
// ─────────────────────────────────────────────────────────────────────────────

/** Payload enviado pelo Outgoing Webhook do Rocket.Chat */
interface RocketPayload {
  token?:        string;
  channel_id:    string;
  channel_name?: string;
  timestamp?:    string;
  user_id:       string;
  user_name?:    string;
  text:          string;
  message_id:    string;
  trigger_word?: string;
  siteUrl?:      string;
}

type Quadrant = "Q1_DO" | "Q2_PLAN" | "Q3_DELEGATE" | "Q4_ELIMINATE";

interface FastDecision {
  quadrant:    Quadrant;
  slaDeadline: Date;
  urgentFlags: string[];
  confident:   boolean; // false = apenas keywords, aguarda TokenRouter
}

interface WebhookResult {
  ok:       boolean;
  taskId:   string;
  quadrant: Quadrant;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2  HMAC VALIDATION [SEC-01]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica assinatura HMAC-SHA256 do Rocket.Chat.
 * Header: X-Rocketchat-Signature: sha256=<hex>
 * Usa timingSafeEqual para prevenir timing attacks.
 */
function verifyHmac(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const digest   = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expected = `sha256=${digest}`;

  // Normalizar comprimento para timingSafeEqual
  const expBuf = Buffer.from(expected);
  const actBuf = Buffer.from(signatureHeader);

  if (expBuf.length !== actBuf.length) return false;
  return timingSafeEqual(expBuf, actBuf);
}

// ─────────────────────────────────────────────────────────────────────────────
// §3  CLASSIFICADOR RÁPIDO (< 5ms, sem LLM)
// ─────────────────────────────────────────────────────────────────────────────

function classifyFast(cleanText: string): FastDecision {
  const lower = cleanText.toLowerCase();

  const q1Flags = ROCKET_KEYWORD_RULES.urgentKeywords.filter((kw) => lower.includes(kw));
  const q3Flags = ROCKET_KEYWORD_RULES.delegateKeywords.filter((kw) => lower.includes(kw));

  let quadrant: Quadrant;
  let slaHours: number;

  if (q1Flags.length > 0) {
    quadrant = "Q1_DO";
    slaHours = 1;
  } else if (q3Flags.length > 0) {
    quadrant = "Q3_DELEGATE";
    slaHours = 4;
  } else {
    quadrant = "Q2_PLAN";
    slaHours = 24;
  }

  return {
    quadrant,
    slaDeadline: new Date(Date.now() + slaHours * 3_600_000),
    urgentFlags: q1Flags,
    confident:   q1Flags.length > 1, // 2+ keywords = confiante sem LLM
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  RESOLUÇÃO DE CONTEXTO (workspace + deal via roomId)
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedContext {
  workspaceId: string;
  dealId:      string | null;
  agentId:     string;
}

async function resolveContext(roomId: string): Promise<ResolvedContext> {
  const workspaceId =
    process.env["WEBHOOK_DEFAULT_WORKSPACE_ID"] ?? "default-workspace";

  // Procura deal cujo meta.rocketRoomId seja este roomId
  const deal = await db.deal.findFirst({
    where: {
      workspaceId,
      meta: { path: ["rocketRoomId"], equals: roomId },
    },
    select: { id: true },
  }).catch(() => null);

  // Agente padrão configurado para o workspace (ou primeiro ativo)
  const agent = await db.agent.findFirst({
    where: { workspaceId, isActive: true },
    select: { id: true },
  }).catch(() => null);

  return {
    workspaceId,
    dealId:  deal?.id ?? null,
    agentId: agent?.id ?? "webhook-agent",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  UPSERT TASK
// ─────────────────────────────────────────────────────────────────────────────

interface UpsertTaskParams {
  workspaceId: string;
  dealId:      string | null;
  roomId:      string;
  messageId:   string;
  title:       string;
  cleanText:   string;
  actorId:     string;
  actorName:   string;
  quadrant:    Quadrant;
  slaDeadline: Date;
}

async function upsertTask(p: UpsertTaskParams): Promise<string> {
  // Chave de dedup: mesmo workspaceId + messageId não cria duplicata
  const descriptionMarker = `RC:${p.roomId}:${p.messageId}`;

  const existing = await db.task.findFirst({
    where: {
      workspaceId: p.workspaceId,
      description: { contains: descriptionMarker },
    },
    select: { id: true },
  });

  const quadrantEnum = p.quadrant as EisenhowerQuadrant;
  const isUrgent     = p.quadrant === "Q1_DO" || p.quadrant === "Q3_DELEGATE";
  const isImportant  = p.quadrant === "Q1_DO" || p.quadrant === "Q2_PLAN";

  if (existing) {
    await db.task.update({
      where: { id: existing.id },
      data: {
        quadrant:  quadrantEnum,
        urgent:    isUrgent,
        important: isImportant,
        dueAt:     p.slaDeadline,
        updatedAt: new Date(),
      },
    });
    return existing.id;
  }

  const task = await db.task.create({
    data: {
      workspaceId: p.workspaceId,
      dealId:      p.dealId,
      title:       `RC @${p.actorName}: ${p.title.slice(0, 80)}`,
      description: JSON.stringify({
        marker:    descriptionMarker,
        status:    "INBOX",
        channel:   "RC",
        roomId:    p.roomId,
        messageId: p.messageId,
        actorId:   p.actorId,
        actorName: p.actorName,
        rawText:   p.cleanText.slice(0, 500),
      }),
      channel:   "RC",
      quadrant:  quadrantEnum,
      urgent:    isUrgent,
      important: isImportant,
      dueAt:     p.slaDeadline,
    },
  });

  return task.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6  BULLMQ — Notificação Q1 para assignee via Rocket.Chat DM
// ─────────────────────────────────────────────────────────────────────────────

export interface Q1NotificationJob {
  taskId:      string;
  workspaceId: string;
  roomId:      string;
  actorId:     string;
  quadrant:    Quadrant;
  slaDeadline: string; // ISO
  text:        string;
}

/** Lazy singleton — só cria se REDIS_URL estiver configurada */
let _q1Queue: Queue | null | "UNINITIALIZED" = "UNINITIALIZED";

function getQ1Queue(): Queue | null {
  if (_q1Queue !== "UNINITIALIZED") return _q1Queue;

  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    console.warn("[RocketWebhook] REDIS_URL não configurada — BullMQ Q1 desativado");
    _q1Queue = null;
    return null;
  }

  _q1Queue = new Queue("q1-notifications", {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts:         3,
      backoff:          { type: "exponential", delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail:     50,
    },
  });
  return _q1Queue;
}

async function enqueueQ1Notification(job: Q1NotificationJob): Promise<void> {
  const queue = getQ1Queue();
  if (!queue) return;

  await queue.add("notify-assignee-rc", job, {
    jobId: `q1:${job.taskId}`, // idempotente por taskId
    delay: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  AUDITLOG [SEC-06]
// ─────────────────────────────────────────────────────────────────────────────

interface AuditParams {
  workspaceId:       string;
  agentId:           string;
  roomId:            string;
  messageId:         string;
  taskId:            string;
  quadrant:          Quadrant;
  durationMs:        number;
  sanitizeWarnings:  string[];
  hasInjection:      boolean;
  finalQuadrant?:    Quadrant; // preenchido após TokenRouter completo
  tokensUsed?:       number;
  costUsd?:          number;
}

async function writeAuditLog(p: AuditParams): Promise<string> {
  const log = await db.agentAuditLog.create({
    data: {
      workspaceId: p.workspaceId,
      agentId:     p.agentId,
      action:      "webhook_rocket",
      input:  {
        roomId:            p.roomId,
        messageId:         p.messageId,
        sanitizeWarnings:  p.sanitizeWarnings,
        hasInjection:      p.hasInjection,
      },
      output: {
        taskId:        p.taskId,
        quadrant:      p.quadrant,
        finalQuadrant: p.finalQuadrant ?? null,
      },
      modelUsed:  "keyword-classifier",
      tokensUsed: p.tokensUsed ?? 0,
      costUsd:    p.costUsd   ?? 0,
      durationMs: p.durationMs,
      success:    true,
    },
    select: { id: true },
  });
  return log.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// §8  BACKGROUND: TokenRouter completo
// ─────────────────────────────────────────────────────────────────────────────

interface BackgroundRouterParams {
  workspaceId:    string;
  agentId:        string;
  roomId:         string;
  messageId:      string;
  cleanText:      string;
  taskId:         string;
  dealId:         string | null;
  auditLogId:     string;
  prelimQuadrant: Quadrant;
}

/**
 * Executa o TokenRouter completo (LLM) em background.
 * Se o quadrante mudar em relação ao prelim, atualiza a Task e o AuditLog.
 * Chamado via after() — não bloqueia a resposta HTTP.
 */
async function runBackgroundRouter(p: BackgroundRouterParams): Promise<void> {
  const bgStart = Date.now();

  try {
    // Import dinâmico para não penalizar cold-start do handler
    const { TokenRouter } = await import("@flow-os/brain/token-router");

    // Stubs mínimos — em produção conectar Redis + pgvector + Groq
    const noop_cache = {
      get: async (_k: string) => null as string | null,
      set: async (_k: string, _v: string, _ttl: number) => {},
    };
    const noop_vector = {
      search: async () => [],
      upsert: async () => {},
    };
    const noop_memory = {
      write: async () => `mem_${Date.now()}`,
    };
    const noop_audit = {
      write: async () => {},
      log:   async () => {},
    };

    // Provider sintético que retorna decisão baseada em keywords
    // Em produção: substituir por GroqProvider, OllamaProvider, etc.
    const syntheticProvider = {
      name: "groq" as const,
      isAvailable: async () => true,
      complete: async (
        _sys: string,
        user: string,
        _schema: unknown,
      ) => {
        const fast = classifyFast(user);
        return {
          decision: {
            quadrant:              fast.quadrant,
            slaDeadline:           fast.slaDeadline.toISOString(),
            provider:              "groq" as const,
            reason:                `Roteamento via classificador rápido RC — ${fast.urgentFlags.join(", ") || "padrão"}`,
            confidence:            fast.confident ? 0.9 : 0.72,
            suggestedAction:       fast.quadrant === "Q1_DO"
              ? "Responder imediatamente ao usuário no Rocket.Chat"
              : "Responder na próxima janela de atendimento",
            urgencyFactors:        fast.urgentFlags,
            estimatedResponseTimeMs: fast.quadrant === "Q1_DO" ? 180 : 600,
          },
          usage: { input: 0, output: 0, total: 0, costUsd: 0 },
        };
      },
    };

    const router = new TokenRouter(
      [syntheticProvider],
      noop_cache,
      noop_vector,
      noop_memory,
      noop_audit,
      { logToConsole: false },
    );

    const templateId = process.env["WORKSPACE_TEMPLATE"] ?? REAL_ESTATE_CAIXA_TEMPLATE_ID;

    const result = await router.route({
      message:     p.cleanText,
      workspaceId: p.workspaceId,
      agentId:     p.agentId,
      templateId,
      channel:     "api",
      ...(p.dealId ? { dealId: p.dealId } : {}),
    });

    const finalQ = result.decision.quadrant as Quadrant;

    // Atualiza task se o quadrante mudou
    if (finalQ !== p.prelimQuadrant) {
      const isUrgent    = finalQ === "Q1_DO" || finalQ === "Q3_DELEGATE";
      const isImportant = finalQ === "Q1_DO" || finalQ === "Q2_PLAN";

      await db.task.update({
        where: { id: p.taskId },
        data: {
          quadrant:  finalQ as EisenhowerQuadrant,
          urgent:    isUrgent,
          important: isImportant,
          dueAt:     new Date(result.decision.slaDeadline),
        },
      });

      // Notifica frontend sobre a mudança de quadrante
      publishKanbanEvent({
        type:      "TASK_UPDATED",
        taskId:    p.taskId,
        dealId:    p.dealId,
        quadrant:  finalQ,
        timestamp: Date.now(),
      });

      console.log(
        `[RocketWebhook] BG router reclassified ${p.taskId}: ${p.prelimQuadrant} → ${finalQ}`,
      );
    }

    // [SEC-06] AuditLog é APPEND-ONLY — criar novo registro em vez de atualizar.
    // O campo amendedFrom rastreia o registro original para auditoria completa.
    await db.agentAuditLog.create({
      data: {
        workspaceId: p.workspaceId,
        agentId:     p.agentId,
        action:      "webhook_rocket.background_router",
        input: {
          roomId:    p.roomId,
          messageId: p.messageId,
          taskId:    p.taskId,
        },
        output: {
          amendedFrom:    p.auditLogId,
          taskId:         p.taskId,
          prelimQuadrant: p.prelimQuadrant,
          finalQuadrant:  finalQ,
          cacheHit:       result.cacheHit,
          confidence:     result.decision.confidence,
          reason:         result.decision.reason,
          suggestedAction: result.decision.suggestedAction,
        },
        modelUsed:  result.decision.provider,
        tokensUsed: result.usage.total,
        costUsd:    result.usage.costUsd,
        durationMs: Date.now() - bgStart,
        success:    true,
      },
    });
  } catch (err) {
    console.error("[RocketWebhook] Background router error:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §9  HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const reqStart = Date.now();

  // ── [SEC-01] Ler body bruto antes de qualquer parse ──────────────────────
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "Failed to read body" }, { status: 400 });
  }

  // ── [SEC-01] Validar assinatura HMAC SHA256 ──────────────────────────────
  const signature = request.headers.get("x-rocketchat-signature") ?? "";
  const secret    = process.env["ROCKET_WEBHOOK_SECRET"] ?? "";

  if (!verifyHmac(rawBody, signature, secret)) {
    console.warn("[RocketWebhook] Invalid HMAC signature", {
      ip:        request.headers.get("x-forwarded-for") ?? "unknown",
      hasSecret: !!secret,
      hasSig:    !!signature,
    });
    return Response.json(
      { error: "Unauthorized — invalid HMAC signature" },
      { status: 401 },
    );
  }

  // ── Parsear payload ───────────────────────────────────────────────────────
  let payload: RocketPayload;
  try {
    payload = JSON.parse(rawBody) as RocketPayload;
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const {
    channel_id: roomId,
    message_id: messageId,
    text,
    user_id:    actorId,
    user_name:  actorName = "unknown",
  } = payload;

  if (!roomId || !messageId || !text?.trim()) {
    return Response.json(
      { error: "Missing required fields: channel_id, message_id, text" },
      { status: 400 },
    );
  }

  // ── [SEC-08] Sanitizar input ──────────────────────────────────────────────
  const sanitizeResult = defaultSanitizer.sanitize(text);
  const cleanText      = sanitizeResult.sanitized;

  if (sanitizeResult.blocked.length > 0) {
    console.warn("[RocketWebhook][SEC-08] Prompt injection detectado", {
      messageId,
      roomId,
      blockedCount: sanitizeResult.blocked.length,
    });
  }

  // ── Resolver contexto (workspaceId + dealId + agentId) ───────────────────
  const { workspaceId, dealId, agentId } = await resolveContext(roomId);

  // ── Classificação rápida por keywords (sem LLM) ───────────────────────────
  const fast = classifyFast(cleanText);

  // ── Upsert Task no banco com quadrante preliminar ────────────────────────
  const taskId = await upsertTask({
    workspaceId,
    dealId,
    roomId,
    messageId,
    title:       cleanText,
    cleanText,
    actorId,
    actorName,
    quadrant:    fast.quadrant,
    slaDeadline: fast.slaDeadline,
  });

  // ── Emitir evento SSE → Kanban board atualiza em tempo real ──────────────
  publishKanbanEvent({
    type:      "TASK_CREATED",
    taskId,
    dealId,
    quadrant:  fast.quadrant,
    channel:   "RC",
    timestamp: Date.now(),
  });

  // ── Se Q1: enfileirar notificação imediata ao assignee ────────────────────
  if (fast.quadrant === "Q1_DO") {
    await enqueueQ1Notification({
      taskId,
      workspaceId,
      roomId,
      actorId,
      quadrant:    fast.quadrant,
      slaDeadline: fast.slaDeadline.toISOString(),
      text:        cleanText.slice(0, 200),
    });
  }

  // ── [SEC-06] Registrar no AuditLog ───────────────────────────────────────
  const auditLogId = await writeAuditLog({
    workspaceId,
    agentId,
    roomId,
    messageId,
    taskId,
    quadrant:         fast.quadrant,
    durationMs:       Date.now() - reqStart,
    sanitizeWarnings: sanitizeResult.warnings,
    hasInjection:     sanitizeResult.blocked.length > 0,
  });

  // ── Background: TokenRouter completo via after() ──────────────────────────
  // Não bloqueia a resposta — Rocket.Chat recebe 200 em < 50ms
  after(async () => {
    await runBackgroundRouter({
      workspaceId,
      agentId,
      roomId,
      messageId,
      cleanText,
      taskId,
      dealId,
      auditLogId,
      prelimQuadrant: fast.quadrant,
    });
  });

  // ── Resposta dentro do SLA 500ms ──────────────────────────────────────────
  const result: WebhookResult = {
    ok:       true,
    taskId,
    quadrant: fast.quadrant,
  };

  console.log(
    `[RocketWebhook] ${fast.quadrant} · taskId=${taskId} · ${Date.now() - reqStart}ms`,
  );

  return Response.json(result, { status: 200 });
}

// ── GET: retorna instruções de configuração ───────────────────────────────────
export function GET(): Response {
  return Response.json({
    endpoint: "/api/webhooks/rocket",
    method:   "POST",
    headers: {
      "Content-Type":            "application/json",
      "X-Rocketchat-Signature":  "sha256=<HMAC-SHA256(ROCKET_WEBHOOK_SECRET, body)>",
    },
    env: {
      ROCKET_WEBHOOK_SECRET:          "required",
      WEBHOOK_DEFAULT_WORKSPACE_ID:   "optional (default: 'default-workspace')",
      REDIS_URL:                      "optional (BullMQ Q1 notifications)",
    },
    flow: [
      "1. HMAC SHA256 validation [SEC-01]",
      "2. Normalize to RouterInput",
      "3. InputSanitizer [SEC-08]",
      "4. Fast keyword classifier (< 5ms)",
      "5. Upsert Task (status: INBOX, channel: RC)",
      "6. SSE event → Kanban board",
      "7. BullMQ Q1 notification (if Q1)",
      "8. AuditLog [SEC-06]",
      "9. after(): Full TokenRouter (LLM, background)",
    ],
  });
}
