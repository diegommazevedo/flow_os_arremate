export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { after, NextRequest, NextResponse } from "next/server";
import { db, InternalMessageType, ProtocolChannel, type EisenhowerQuadrant } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { generateProtocol } from "@flow-os/brain/lib/protocol-generator";
import { computeDueAt, PIPELINE_MASTER_CONFIG, UF_DEPARTMENT_MAP } from "@flow-os/templates";
import { appendAuditLog } from "@/lib/chatguru-api";
import { publishInternalEvent, publishKanbanEvent } from "@/lib/sse-bus";
import { decrypt } from "@/lib/encrypt";
import { uploadChatMediaBuffer, extFromMime } from "@/lib/chat-media-storage";
import {
  detectEvolutionMedia,
  extractInlineEvolutionMediaBuffer,
  tryJpegThumbnail,
  fetchEvolutionMediaBuffer,
  type EvolutionMediaKind,
} from "@/lib/evolution-fetch-media";
import { normalizeEvolutionApiBaseUrl } from "@/lib/evolution";

type Quadrant = "Q1_DO" | "Q2_PLAN" | "Q3_DELEGATE" | "Q4_ELIMINATE";

interface EvolutionWebhookPayload {
  instance?: string;
  data?: {
    messageTimestamp?: number;
    key?: {
      remoteJid?: string;
      id?: string;
      fromMe?: boolean;
      participant?: string;
    };
    message?: Record<string, unknown>;
    /** Evolution v2 envia base64 no nível data quando webhookBase64=true */
    base64?: string;
    pushName?: string;
    /** Evolution v2 envia o nome do grupo aqui em mensagens de grupo */
    groupSubject?: string;
  };
}

const Q1_KEYWORDS = [
  "urgente", "prazo", "vence", "vencendo", "amanha", "hoje",
  "pagar", "pagamento", "cancelar", "perder", "perdi", "socorro",
  "atrasado", "bloqueado", "parado", "imediato", "expirou",
];

const Q3_KEYWORDS = [
  "duvida", "pergunta", "como", "onde", "quando", "informacao",
  "consultar", "explicar", "entender",
];

function classifyFast(text: string): { quadrant: Quadrant; slaDeadline: Date } {
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

function textFromEvolutionMessage(msg: Record<string, unknown> | undefined): string {
  if (!msg) return "";
  const c = msg["conversation"];
  if (typeof c === "string" && c.trim()) return c;
  const ext = msg["extendedTextMessage"];
  if (ext && typeof ext === "object" && ext !== null) {
    const t = (ext as Record<string, unknown>)["text"];
    if (typeof t === "string") return t;
  }
  return "";
}

function evolutionHttpCtx(config: Record<string, string>): { baseUrl: string; apiKey: string } {
  const baseUrl = normalizeEvolutionApiBaseUrl(
    config["apiUrl"] ||
      config["EVOLUTION_API_URL"] ||
      process.env["EVOLUTION_API_URL"] ||
      "http://localhost:8080",
  );
  const apiKey = config["apiKey"]
    ? (() => {
        try {
          return decrypt(config["apiKey"]);
        } catch {
          return process.env["EVOLUTION_API_KEY"] ?? "";
        }
      })()
    : (process.env["EVOLUTION_API_KEY"] ?? "");
  return { baseUrl, apiKey };
}

async function tryStoreEvolutionInboundMedia(params: {
  workspaceId: string;
  messageId: string;
  instance: string;
  config: Record<string, string>;
  key: { remoteJid?: string; id?: string; fromMe?: boolean };
  message: Record<string, unknown> | undefined;
}): Promise<{
  kind: EvolutionMediaKind;
  url: string;
  fileName?: string;
  mimeType: string;
  caption: string;
} | null> {
  const mediaMeta = detectEvolutionMedia(params.message);
  if (!mediaMeta) return null;

  console.log("[webhook/evolution]", "processando mídia", {
    messageId: params.messageId,
    kind: mediaMeta.kind,
    instance: params.instance,
  });

  const convertToMp4 = mediaMeta.kind === "VIDEO" || mediaMeta.kind === "AUDIO";
  let buf: Buffer | null = null;
  let mime =
    (mediaMeta.mimetype ?? "application/octet-stream").split(";")[0]?.trim() ??
    "application/octet-stream";

  // Preferir base64 inline do webhook (webhook_base64=true) e só cair para API quando ausente.
  const inlineMedia = extractInlineEvolutionMediaBuffer({
    message: params.message,
    fallbackMime: mime,
  });

  if (inlineMedia) {
    buf = inlineMedia.buffer;
    mime = inlineMedia.mime.split(";")[0]?.trim() ?? mime;
  } else {
    const { baseUrl, apiKey } = evolutionHttpCtx(params.config);
    if (!apiKey) {
      console.warn("[webhook/evolution] sem apiKey para baixar mídia");
      return null;
    }

    const downloaded = await fetchEvolutionMediaBuffer({
      baseUrl,
      apiKey,
      instance: params.instance,
      key: params.key,
      message: params.message ?? {},
      convertToMp4,
      fallbackMime: mime,
    });

    if (downloaded) {
      buf = downloaded.buffer;
      mime = downloaded.mime.split(";")[0]?.trim() ?? mime;
    }
  }

  if (!buf && mediaMeta.kind === "IMAGE") {
    const thumb = tryJpegThumbnail(params.message);
    if (thumb) {
      buf = thumb.buffer;
      mime = "image/jpeg";
    }
  }

  if (!buf) {
    console.warn("[webhook/evolution] download mídia falhou", params.messageId);
    return null;
  }

  try {
    const ext = extFromMime(mime);
    const { url } = await uploadChatMediaBuffer({
      workspaceId: params.workspaceId,
      messageId: params.messageId,
      ext,
      contentType: mime,
      buffer: buf,
    });
    console.log("[webhook/evolution]", "mídia salva MinIO", { messageId: params.messageId, kind: mediaMeta.kind });
    return {
      kind: mediaMeta.kind,
      url,
      mimeType: mime,
      caption: mediaMeta.caption,
      ...(mediaMeta.fileName ? { fileName: mediaMeta.fileName } : {}),
    };
  } catch (err) {
    console.error("[webhook/evolution] MinIO upload falhou", err);
    return null;
  }
}

async function isAlreadyProcessed(workspaceId: string, messageId: string): Promise<boolean> {
  const existing = await db.agentAuditLog.findFirst({
    where: {
      workspaceId,
      action: "webhook_evolution",
      input: { path: ["messageId"], equals: messageId },
    },
    select: { id: true },
  }).catch(() => null);

  return Boolean(existing);
}

// Cache em memória - evita seq scan em workspace_integrations a cada webhook
const integrationCache = new Map<string, {
  data: { workspaceId: string; config: unknown } | null;
  expiresAt: number;
}>();
const INTEGRATION_CACHE_TTL = 60_000; // 1 minuto
const groupSubjectCache = new Map<string, { subject: string; expiresAt: number }>();
const GROUP_SUBJECT_CACHE_TTL = 5 * 60_000; // 5 minutos

async function resolveIntegration(instance: string) {
  const cached = integrationCache.get(instance);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const result = await db.workspaceIntegration.findFirst({
    where: {
      type: "WHATSAPP_EVOLUTION",
      status: "ACTIVE",
      OR: [
        { config: { path: ["EVOLUTION_INSTANCE_NAME"], equals: instance } },
        { config: { path: ["instanceName"], equals: instance } },
      ],
    },
    select: { workspaceId: true, config: true },
  });

  integrationCache.set(instance, { data: result, expiresAt: Date.now() + INTEGRATION_CACHE_TTL });
  return result;
}

function extractGroupSubjectFromFindInfos(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const readSubject = (candidate: unknown): string | null => {
    if (!candidate || typeof candidate !== "object") return null;
    const rec = candidate as Record<string, unknown>;
    const subject = rec["subject"];
    if (typeof subject === "string" && subject.trim()) return defaultSanitizer.clean(subject);
    return null;
  };

  const root = payload as Record<string, unknown>;
  const fromRoot = readSubject(root);
  if (fromRoot) return fromRoot;

  const groupInfo = root["groupInfo"];
  const fromGroupInfo = readSubject(groupInfo);
  if (fromGroupInfo) return fromGroupInfo;

  const data = root["data"];
  if (Array.isArray(data)) {
    for (const item of data) {
      const fromItem = readSubject(item);
      if (fromItem) return fromItem;
      const fromNested = readSubject((item as Record<string, unknown>)?.["groupInfo"]);
      if (fromNested) return fromNested;
    }
  } else {
    const fromData = readSubject(data);
    if (fromData) return fromData;
    const fromDataNested = readSubject((data as Record<string, unknown> | null)?.["groupInfo"]);
    if (fromDataNested) return fromDataNested;
  }

  return null;
}

async function resolveGroupSubject(params: {
  instance: string;
  groupJid: string;
  config: Record<string, string>;
}): Promise<string | null> {
  const cacheKey = `${params.instance}:${params.groupJid}`;
  const cached = groupSubjectCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.subject;

  const { baseUrl, apiKey } = evolutionHttpCtx(params.config);
  if (!apiKey) return null;

  try {
    const url = `${baseUrl}/group/findGroupInfos/${encodeURIComponent(params.instance)}?groupJid=${encodeURIComponent(params.groupJid)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { apikey: apiKey },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const json = (await response.json().catch(() => null)) as unknown;
    const subject = extractGroupSubjectFromFindInfos(json);
    if (!subject) return null;

    groupSubjectCache.set(cacheKey, {
      subject,
      expiresAt: Date.now() + GROUP_SUBJECT_CACHE_TTL,
    });
    return subject;
  } catch {
    return null;
  }
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
    select: { id: true, name: true },
  });

  if (existing) {
    // Atualiza nome se mudou (pushName pode variar no WhatsApp)
    if (safeName && safeName !== existing.name && safeName !== "WhatsApp") {
      await db.contact.update({ where: { id: existing.id }, data: { name: safeName } }).catch(() => {});
    }
    return existing.id;
  }

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

  const enteredAt = new Date();
  const triagemStage = PIPELINE_MASTER_CONFIG.stages.find((stage) => stage.id === "triagem");
  const { dueAt, basis } = computeDueAt({
    stageId: "triagem",
    enteredAt,
    stage: triagemStage ?? null,
  });

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
        stageId: "triagem",
        dueAt: dueAt?.toISOString() ?? null,
        slaBasis: basis,
        stageEnteredAt: enteredAt.toISOString(),
        channels: ["WA_EVOLUTION"],
        sourceChannel: "whatsapp_evolution",
      },
    },
    select: { id: true, meta: true },
  });

  return { id: created.id, uf: null };
}

async function upsertTask(params: {
  workspaceId: string;
  dealId?: string;
  phone: string;
  instance: string;
  name: string;
  messageId: string;
  cleanText: string;
  quadrant: Quadrant;
  slaDeadline: Date;
  channel: "WA_EVOLUTION" | "WA_GROUP";
}): Promise<string> {
  // 1. Busca task aberta do mesmo deal+channel (conversa existente)
  if (params.dealId) {
    const byDeal = await db.task.findFirst({
      where: {
        workspaceId: params.workspaceId,
        dealId: params.dealId,
        channel: params.channel,
        completedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (byDeal) {
      // Atualiza última mensagem na task existente
      await db.task.update({
        where: { id: byDeal.id },
        data: {
          updatedAt: new Date(),
          description: JSON.stringify({
            channel: params.channel,
            phone: params.phone,
            name: params.name,
            messageId: params.messageId,
            rawText: params.cleanText.slice(0, 500),
          }),
        },
      });
      return byDeal.id;
    }
  }

  // 2. Fallback: busca por messageId (dedup exata)
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
      ...(params.dealId ? { dealId: params.dealId } : {}),
      title: `${params.channel} ${params.name}: ${params.cleanText.slice(0, 80)}`,
      description: JSON.stringify({
        marker: `${params.channel}:${params.phone}:${params.messageId}`,
        status: "INBOX",
        channel: params.channel,
        phone: params.phone,
        name: params.name,
        messageId: params.messageId,
        rawText: params.cleanText.slice(0, 500),
      }),
      type: "WhatsApp",
      channel: params.channel,
      aparelhoOrigem: params.instance,
      quadrant,
      urgent,
      important,
      dueAt: params.slaDeadline,
    },
    select: { id: true },
  });

  return task.id;
}

/** Mescla JSON em `Task.description` para conversas de grupo (uma task por groupId). */
function mergeGroupTaskDescription(prev: string | null, patch: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(prev ?? "{}") as Record<string, unknown>;
  } catch {
    base = {};
  }
  return JSON.stringify({ ...base, ...patch });
}

function auditDisplayText(
  cleanText: string,
  stored: { kind: EvolutionMediaKind; caption: string } | null,
  mediaMeta: ReturnType<typeof detectEvolutionMedia>,
): string {
  if (stored) {
    return stored.caption.trim() ? stored.caption.slice(0, 500) : `[${stored.kind}]`;
  }
  if (mediaMeta && !cleanText.trim()) {
    return `[${mediaMeta.kind}]`;
  }
  return cleanText.slice(0, 500);
}

/** Evolution envia pushName "@lid" quando não há nome visível - evita título Task/Contact inútil. */
function evolutionParticipantDisplayName(cleanedPushName: string, phoneKey: string): string {
  const n = cleanedPushName.trim();
  if (!n || /^@lid$/i.test(n) || n.toLowerCase() === "whatsapp") {
    const d = phoneKey.replace(/\D/g, "");
    return d.length >= 4 ? `Cliente ·${d.slice(-4)}` : "WhatsApp";
  }
  return n;
}

export async function POST(req: NextRequest) {
  const headerApikey = req.headers.get("apikey");
  const headerXToken = req.headers.get("x-webhook-token");
  const headerBearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const incomingApiKey = headerApikey ?? headerXToken ?? headerBearer;
  const validWebhookToken = process.env["EVOLUTION_WEBHOOK_TOKEN"];
  const validApiKey = process.env["EVOLUTION_API_KEY"];
  const isAuthorized =
    Boolean(incomingApiKey) &&
    (incomingApiKey === validWebhookToken || incomingApiKey === validApiKey);

  // TODO: remover após confirmar webhook auth funcionando
  console.log("[webhook-auth]", {
    headerApikey: headerApikey ? `…${headerApikey.slice(-4)}` : null,
    headerXToken: headerXToken ? `…${headerXToken.slice(-4)}` : null,
    headerBearer: headerBearer ? `…${headerBearer.slice(-4)}` : null,
    envToken: validWebhookToken ? `…${validWebhookToken.slice(-4)}` : null,
    envApiKey: validApiKey ? `…${validApiKey.slice(-4)}` : null,
    isAuthorized,
  });

  if (!isAuthorized) {
    return new Response(null, { status: 401 });
  }

  const startedAt = Date.now();
  const payload = (await req.json().catch(() => null)) as EvolutionWebhookPayload | null;
  if (!payload?.instance || !payload.data?.key?.remoteJid || !payload.data.key.id) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const instance = payload.instance;
  const remoteJid = payload.data.key.remoteJid;
  const messageId = payload.data.key.id;
  const isFromMe = payload.data.key.fromMe === true;
  const isGroup = remoteJid.includes("@g.us");
  const from = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
  const messageRecord = payload.data.message;

  // Evolution v2 com webhookBase64=true envia base64 em data.base64, não em message.base64
  // Normalizar para que extractInlineEvolutionMediaBuffer encontre no nível message
  if (payload.data.base64 && messageRecord && !messageRecord["base64"]) {
    messageRecord["base64"] = payload.data.base64;
  }

  const mediaMeta = detectEvolutionMedia(messageRecord);
  const textFromConv = textFromEvolutionMessage(messageRecord);

  let rawText = textFromConv.trim()
    ? textFromConv
    : mediaMeta?.caption?.trim()
      ? mediaMeta.caption
      : mediaMeta
        ? `[${mediaMeta.kind.toLowerCase()}]`
        : "[mídia]";

  const sanitized = defaultSanitizer.sanitize(rawText);
  const cleanText = sanitized.sanitized;

  const integration = await resolveIntegration(instance);
  if (!integration) {
    return new Response(null, { status: 404 });
  }

  const workspaceId = integration.workspaceId;
  if (await isAlreadyProcessed(workspaceId, messageId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const config = (integration.config ?? {}) as Record<string, string>;
  const storedMedia = await tryStoreEvolutionInboundMedia({
    workspaceId,
    messageId,
    instance,
    config,
    key: payload.data.key,
    message: messageRecord,
  });

  const displayForAudit = auditDisplayText(cleanText, storedMedia, mediaMeta);

  console.log("[webhook/evolution]", "mensagem aceita", {
    instance,
    messageId,
    fromSuffix: from.slice(-6),
    isGroup,
    hasMediaMeta: Boolean(mediaMeta),
    mediaStored: Boolean(storedMedia),
    mediaKind: mediaMeta?.kind ?? storedMedia?.kind ?? null,
  });

  const rawPush = defaultSanitizer.clean(payload.data.pushName ?? "");

  const mediaBlock = storedMedia
    ? {
        media: {
          kind: storedMedia.kind,
          url: storedMedia.url,
          fileName: storedMedia.fileName,
          mimeType: storedMedia.mimeType,
        },
      }
    : {};

  if (isGroup) {
    const shortGroupId = remoteJid.replace("@g.us", "");
    const groupJid = remoteJid;
    const participantJid = typeof payload.data.key?.participant === "string" ? payload.data.key.participant : "";
    const senderName = evolutionParticipantDisplayName(
      defaultSanitizer.clean(payload.data.pushName ?? ""),
      participantJid.replace("@s.whatsapp.net", "") || shortGroupId,
    );
    // Nome do grupo: groupSubject do payload (Evolution v2) > consulta findGroupInfos > fallback.
    const payloadGroupSubject = typeof payload.data.groupSubject === "string" && payload.data.groupSubject.trim()
      ? defaultSanitizer.clean(payload.data.groupSubject)
      : "";
    const groupSubject =
      payloadGroupSubject ||
      (await resolveGroupSubject({ instance, groupJid, config })) ||
      "";
    const msgTimestamp =
      typeof payload.data.messageTimestamp === "number" ? payload.data.messageTimestamp : Date.now();

    const decision = classifyFast(cleanText);
    const quadrant = decision.quadrant as EisenhowerQuadrant;
    const urgent = decision.quadrant === "Q1_DO" || decision.quadrant === "Q3_DELEGATE";
    const important = decision.quadrant === "Q1_DO" || decision.quadrant === "Q2_PLAN";

    // Coluna groupId = id estável (só dígitos); JSON pode incluir groupJid completo para debug
    let groupTask =
      (await db.task.findFirst({
        where: { workspaceId, groupId: shortGroupId },
      })) ??
      (await db.task.findFirst({
        where: {
          workspaceId,
          description: { contains: `"groupId":"${shortGroupId}"` },
        },
      })) ??
      (await db.task.findFirst({
        where: {
          workspaceId,
          description: { contains: `"groupJid":"${groupJid}"` },
        },
      }));

    let createdNew = false;
    if (!groupTask) {
      groupTask = await db.task.create({
        data: {
          workspaceId,
          title: `Grupo: ${groupSubject || senderName || shortGroupId}`,
          groupId: shortGroupId,
          channel: "WA_GROUP",
          description: mergeGroupTaskDescription(null, {
            groupId: shortGroupId,
            groupJid,
            groupName: groupSubject || senderName,
            instanceName: instance,
            channel: "WA_GROUP",
            name: senderName,
            phone: shortGroupId,
            rawText: cleanText.slice(0, 500),
          }),
          type: "WhatsApp",
          aparelhoOrigem: instance,
          quadrant,
          urgent,
          important,
          dueAt: decision.slaDeadline,
        },
      });
      createdNew = true;
    } else {
      // Normaliza groupId para formato completo e atualiza última mensagem + nome do grupo
      await db.task.update({
        where: { id: groupTask.id, workspaceId },
        data: {
          ...(groupSubject ? { title: `Grupo: ${groupSubject}` } : {}),
          groupId: shortGroupId,
          channel: "WA_GROUP",
          description: mergeGroupTaskDescription(groupTask.description, {
            groupId: shortGroupId,
            groupJid,
            // Só atualizar groupName se temos groupSubject confirmado — evita sobrescrever com nome do remetente
            ...(groupSubject ? { groupName: groupSubject } : {}),
            instanceName: instance,
            channel: "WA_GROUP",
            name: senderName,
            phone: shortGroupId,
            rawText: cleanText.slice(0, 500),
          }),
        },
      });
    }

    // ChatSession: uma por grupo (vinculada à task do grupo)
    await db.chatSession.upsert({
      where: { taskId: groupTask.id },
      create: {
        workspaceId,
        taskId: groupTask.id,
        status: "ABERTO",
        aparelhoOrigem: instance,
        unreadCount: 1,
        totalAtendimentos: 1,
      },
      update: {
        status: "ABERTO",
        aparelhoOrigem: instance,
        unreadCount: { increment: 1 },
      },
    });

    after(() => {
      void appendAuditLog({
        workspaceId,
        action: "webhook_evolution",
        input: {
          messageId,
          instance,
          from: groupJid,
          participantJid,
          senderName,
          isGroup: true,
          rawText: cleanText.slice(0, 300),
          channel: "WA_GROUP",
          hasInjection: sanitized.blocked.length > 0,
        },
        output: {
          taskId: groupTask!.id,
          channel: "WA_GROUP",
          text: displayForAudit.slice(0, 300),
          ...mediaBlock,
          groupMessageMeta: {
            from: senderName,
            messageId,
            timestamp: msgTimestamp,
          },
        },
        durationMs: Date.now() - startedAt,
      }).catch(() => undefined);
    });

    if (createdNew) {
      publishKanbanEvent({
        type: "TASK_CREATED",
        taskId: groupTask.id,
        channel: "WA_GROUP",
        quadrant: decision.quadrant,
        timestamp: Date.now(),
      });
    } else {
      publishKanbanEvent({
        type: "NEW_MESSAGE",
        taskId: groupTask.id,
        channel: "WA_GROUP",
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({ ok: true });
  }

  let safeName = evolutionParticipantDisplayName(rawPush, from);
  if (isFromMe) {
    const digits = from.replace(/\D/g, "");
    const existingContact = await db.contact.findFirst({
      where: { workspaceId, phone: { in: [digits, `+${digits}`, from] } },
      select: { name: true },
    });
    if (existingContact?.name?.trim()) {
      safeName = existingContact.name.trim();
    }
  }

  const contactId = await resolveOrCreateContact(workspaceId, from, safeName);
  const deal = await resolveOrCreateDeal(workspaceId, contactId, from);
  const decision = classifyFast(cleanText);
  const taskId = await upsertTask({
    workspaceId,
    dealId: deal.id,
    phone: from,
    instance,
    name: safeName,
    messageId,
    cleanText,
    quadrant: decision.quadrant,
    slaDeadline: decision.slaDeadline,
    channel: "WA_EVOLUTION",
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
      `Mensagem via Evolution - ${new Date().toLocaleDateString("pt-BR")}`,
      taskId,
    )).protocol;

  const protocolConteudo = storedMedia
    ? JSON.stringify({
        kind: "media",
        mediaKind: storedMedia.kind,
        url: storedMedia.url,
        caption: cleanText.slice(0, 500),
        fileName: storedMedia.fileName ?? null,
      })
    : cleanText;

  await db.protocolMessage.create({
    data: {
      workspaceId,
      protocolId: protocol.id,
      direction: "IN",
      canal: ProtocolChannel.WHATSAPP,
      conteudo: protocolConteudo,
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
      aparelhoOrigem: instance,
      unreadCount: 1,
      totalAtendimentos: 1,
    },
    update: {
      status: "ABERTO",
      ...(departamentoId ? { departamentoId } : {}),
      aparelhoOrigem: instance,
      unreadCount: { increment: 1 },
      totalAtendimentos: { increment: 1 },
    },
  });

  publishKanbanEvent({
    type: "DEAL_UPDATE",
    dealId: deal.id,
    taskId,
    channel: "WA_EVOLUTION",
    quadrant: decision.quadrant,
    timestamp: Date.now(),
  });

  if (decision.quadrant === "Q1_DO") {
    await alertPriorityChannel(workspaceId, deal.id, cleanText.slice(0, 120), protocol.id);
  }

  after(() => {
    void appendAuditLog({
      workspaceId,
      action: "webhook_evolution",
      input: {
        messageId,
        instance,
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
        text: displayForAudit.slice(0, 500),
        ...mediaBlock,
      },
      durationMs: Date.now() - startedAt,
    }).catch(() => undefined);
  });

  return NextResponse.json({ ok: true });
}
