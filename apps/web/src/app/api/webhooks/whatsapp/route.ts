/**
 * WhatsApp Meta webhook.
 *
 * GET  -> challenge verification
 * POST -> incoming messages
 *
 * Invariants:
 *   [SEC-01] HMAC validation on POST
 *   [SEC-06] append-only audit log
 *   [SEC-08] sanitizer before persistence
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { db, InternalMessageType, ProtocolChannel, type EisenhowerQuadrant } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { generateProtocol } from "@flow-os/brain/lib/protocol-generator";
import { UF_DEPARTMENT_MAP } from "@flow-os/templates";
import { publishInternalEvent, publishKanbanEvent } from "@/lib/sse-bus";

interface MetaContact {
  profile: { name: string };
  wa_id: string;
}

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "reaction" | "button" | "interactive" | "unknown";
  text?: { body: string };
  button?: { text: string; payload: string };
}

interface MetaChangeValue {
  messaging_product: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: Array<{ id: string; status: string }>;
}

interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{ value: MetaChangeValue; field: string }>;
  }>;
}

type Quadrant = "Q1_DO" | "Q2_PLAN" | "Q3_DELEGATE" | "Q4_ELIMINATE";

const Q1_KEYWORDS = [
  "urgente", "prazo", "vence", "vencendo", "amanha", "hoje",
  "pagar", "pagamento", "cancelar", "perder", "perdi", "socorro",
  "atrasado", "bloqueado", "parado", "imediato", "expirou",
];

const Q3_KEYWORDS = [
  "duvida", "pergunta", "como", "onde", "quando", "informacao",
  "consultar", "explicar", "entender",
];

interface FastDecision {
  quadrant: Quadrant;
  slaDeadline: Date;
}

function verifyHmac(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expected = `sha256=${digest}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader.trim());

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function classifyFast(text: string): FastDecision {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (Q1_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { quadrant: "Q1_DO", slaDeadline: new Date(Date.now() + 60 * 60 * 1000) };
  }

  if (Q3_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { quadrant: "Q3_DELEGATE", slaDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000) };
  }

  return { quadrant: "Q2_PLAN", slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000) };
}

async function resolveAuditAgentId(workspaceId: string): Promise<string | null> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return agent?.id ?? null;
}

async function isAlreadyProcessed(workspaceId: string, messageId: string): Promise<boolean> {
  const existing = await db.agentAuditLog.findFirst({
    where: {
      workspaceId,
      action: "webhook_whatsapp",
      input: { path: ["messageId"], equals: messageId },
    },
    select: { id: true },
  }).catch(() => null);

  return Boolean(existing);
}

async function resolveIntegration(phoneNumberId: string) {
  return db.workspaceIntegration.findFirst({
    where: {
      type: "WHATSAPP_META",
      status: "ACTIVE",
      config: { path: ["META_PHONE_NUMBER_ID"], equals: phoneNumberId },
    },
    select: {
      workspaceId: true,
      config: true,
    },
  });
}

async function alertPriorityChannel(
  workspaceId: string,
  dealId: string,
  motivo: string,
  protocolId?: string,
): Promise<void> {
  const channel = await db.internalChannel.findFirst({
    where: { workspaceId, nome: "alertas-q1" },
    select: { id: true },
  });

  if (!channel) return;

  const message = await db.internalMessage.create({
    data: {
      workspaceId,
      channelId: channel.id,
      autorId: "SISTEMA",
      tipo: InternalMessageType.ALERTA_Q1,
      dealId,
      ...(protocolId ? { protocolId } : {}),
      conteudo: `ALERTA Q1 - ${motivo}`,
    },
  });

  publishInternalEvent({
    type: "Q1_ALERT",
    workspaceId,
    channelId: channel.id,
    dealId,
    payload: { messageId: message.id, conteudo: message.conteudo },
    timestamp: Date.now(),
    ...(protocolId ? { protocolId } : {}),
  });
}

async function autoAssignDepartamento(
  uf: string,
  workspaceId: string,
): Promise<string | null> {
  // MAPEAMENTO EXTERNO — chaves genéricas definidas em @flow-os/templates
  const nomeDept = UF_DEPARTMENT_MAP[uf.toUpperCase()];
  if (!nomeDept) return null;

  const department = await db.department.findFirst({
    where: { workspaceId, nome: nomeDept },
    select: { id: true },
  });

  return department?.id ?? null;
}

async function resolveOrCreateContact(
  workspaceId: string,
  phone: string,
  name: string,
): Promise<string> {
  const digits = phone.replace(/\D/g, "");
  const safeName = defaultSanitizer.clean(name || "WhatsApp");

  const existing = await db.contact.findFirst({
    where: { workspaceId, phone: { in: [digits, `+${digits}`, phone] } },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await db.contact.create({
    data: {
      workspaceId,
      name: safeName,
      phone: digits,
      type: "PERSON",
      meta: {
        sourceChannel: "whatsapp",
      },
    },
    select: { id: true },
  });

  return created.id;
}

async function resolveOrCreateDeal(
  workspaceId: string,
  contactId: string,
  phone: string,
): Promise<{ id: string; uf: string | null }> {
  const existing = await db.deal.findFirst({
    where: { workspaceId, contactId, closedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, meta: true },
  });

  if (existing) {
    const meta = (existing.meta ?? {}) as Record<string, unknown>;
    return { id: existing.id, uf: typeof meta["uf"] === "string" ? meta["uf"] : null };
  }

  const firstStage = await db.stage.findFirst({
    where: { workspaceId },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  if (!firstStage) throw new Error("Workspace sem stages configurados");

  const created = await db.deal.create({
    data: {
      workspaceId,
      stageId: firstStage.id,
      contactId,
      title: `WA Lead ${phone.slice(-4)}`,
      meta: {
        eisenhower: "Q2_PLAN",
        kanbanStatus: "inbox",
        currentPhase: "triagem",
        channels: ["WA"],
        sourceChannel: "whatsapp",
      },
    },
    select: { id: true, meta: true },
  });

  return { id: created.id, uf: null };
}

async function upsertTask(params: {
  workspaceId: string;
  dealId: string;
  phone: string;
  phoneNumberId: string;
  name: string;
  messageId: string;
  cleanText: string;
  quadrant: Quadrant;
  slaDeadline: Date;
}): Promise<string> {
  const existing = await db.task.findFirst({
    where: {
      workspaceId: params.workspaceId,
      description: { contains: params.messageId },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const quadrant = params.quadrant as EisenhowerQuadrant;
  const urgent = params.quadrant === "Q1_DO" || params.quadrant === "Q3_DELEGATE";
  const important = params.quadrant === "Q1_DO" || params.quadrant === "Q2_PLAN";

  const task = await db.task.create({
    data: {
      workspaceId: params.workspaceId,
      dealId: params.dealId,
      title: `WA ${params.name}: ${params.cleanText.slice(0, 80)}`,
      description: JSON.stringify({
        marker: `WA:${params.phone}:${params.messageId}`,
        status: "INBOX",
        channel: "WA",
        phone: params.phone,
        name: params.name,
        messageId: params.messageId,
        rawText: params.cleanText.slice(0, 500),
      }),
      type: "WhatsApp",
      channel: "WA",
      aparelhoOrigem: params.phoneNumberId,
      quadrant,
      urgent,
      important,
      dueAt: params.slaDeadline,
    },
    select: { id: true },
  });

  return task.id;
}

async function sendAutoReply(
  phone: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<void> {
  const digits = phone.replace(/\D/g, "");
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: digits,
      type: "text",
      text: {
        preview_url: false,
        body: "Recebemos sua mensagem urgente. Nossa equipe entrara em contato em ate 1 hora.",
      },
    }),
  }).catch((error) => {
    console.error("[whatsapp-webhook] auto reply failed:", error);
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expectedToken = process.env["META_WEBHOOK_VERIFY_TOKEN"];

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const rawBody = await req.text();

  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const appSecret = process.env["META_APP_SECRET"] ?? "";
  if (appSecret && !verifyHmac(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const integration = await resolveIntegration(phoneNumberId);

      if (!integration) {
        return new Response(null, { status: 404 });
      }

      const config = (integration.config ?? {}) as Record<string, unknown>;
      const accessToken = typeof config["META_ACCESS_TOKEN"] === "string" ? config["META_ACCESS_TOKEN"] : "";
      const workspaceId = integration.workspaceId;

      for (const message of value.messages ?? []) {
        if (message.type !== "text" && message.type !== "button") continue;

        const rawText = message.text?.body ?? message.button?.text ?? "";
        if (!rawText) continue;

        if (await isAlreadyProcessed(workspaceId, message.id)) continue;

        const sanitized = defaultSanitizer.sanitize(rawText);
        const cleanText = sanitized.sanitized;
        const from = message.from;
        const contactName = value.contacts?.find((contact) => contact.wa_id === from)?.profile.name ?? from;
        const safeName = defaultSanitizer.clean(contactName);

        const contactId = await resolveOrCreateContact(workspaceId, from, safeName);
        const deal = await resolveOrCreateDeal(workspaceId, contactId, from);
        const decision = classifyFast(cleanText);
        const taskId = await upsertTask({
          workspaceId,
          dealId: deal.id,
          phone: from,
          phoneNumberId,
          name: safeName,
          messageId: message.id,
          cleanText,
          quadrant: decision.quadrant,
          slaDeadline: decision.slaDeadline,
        });

        const existingProtocol = await db.protocol.findFirst({
          where: { workspaceId, taskId },
          select: { id: true, number: true },
          orderBy: { createdAt: "desc" },
        });

        const protocol =
          existingProtocol ??
          (await generateProtocol(
            deal.id,
            workspaceId,
            ProtocolChannel.WHATSAPP,
            `Mensagem via WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`,
            taskId,
          )).protocol;

        await db.protocolMessage.create({
          data: {
            workspaceId,
            protocolId: protocol.id,
            direction: "IN",
            canal: ProtocolChannel.WHATSAPP,
            conteudo: cleanText,
            autorId: null,
          },
        });

        const departamentoId = deal.uf ? await autoAssignDepartamento(deal.uf, workspaceId) : null;
        await db.chatSession.upsert({
          where: { taskId },
          create: {
            workspaceId,
            taskId,
            status: "ABERTO",
            departamentoId,
            aparelhoOrigem: phoneNumberId,
            unreadCount: 1,
            totalAtendimentos: 1,
          },
          update: {
            status: "ABERTO",
            ...(departamentoId ? { departamentoId } : {}),
            aparelhoOrigem: phoneNumberId,
            unreadCount: { increment: 1 },
            totalAtendimentos: { increment: 1 },
          },
        });

        publishKanbanEvent({
          type: "DEAL_UPDATE",
          dealId: deal.id,
          taskId,
          channel: "WA",
          quadrant: decision.quadrant,
          timestamp: Date.now(),
        });

        if (decision.quadrant === "Q1_DO") {
          await alertPriorityChannel(workspaceId, deal.id, cleanText.slice(0, 120), protocol.id);
        }

        if (decision.quadrant === "Q1_DO" && process.env["META_AUTO_REPLY"] === "true" && accessToken) {
          after(() => void sendAutoReply(from, phoneNumberId, accessToken));
        }

        const auditAgentId = await resolveAuditAgentId(workspaceId);
        if (auditAgentId) {
          after(() => {
            void db.agentAuditLog.create({
              data: {
                workspaceId,
                agentId: auditAgentId,
                action: "webhook_whatsapp",
                input: {
                  messageId: message.id,
                  phoneNumberId,
                  from,
                  name: safeName,
                  rawText: cleanText.slice(0, 300),
                  hasInjection: sanitized.blocked.length > 0,
                },
                output: {
                  taskId,
                  dealId: deal.id,
                  contactId,
                  quadrant: decision.quadrant,
                  departamentoId,
                  protocolId: protocol.id,
                  protocolNumber: protocol.number,
                },
                modelUsed: "classifyFast",
                tokensUsed: 0,
                costUsd: 0,
                durationMs: Date.now() - startedAt,
                success: true,
              },
            }).catch((error) => {
              console.error("[whatsapp-webhook] audit failed:", error);
            });
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
