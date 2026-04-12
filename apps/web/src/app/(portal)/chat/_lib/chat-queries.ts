/**
 * FlowOS v4 — Chat omnichannel: queries
 *
 * Conversas = Tasks criadas pelos webhooks (WA/RC/PWA).
 * Histórico = AgentAuditLog de ações webhook + envio de mensagens.
 *
 * [SEC-03] workspaceId obrigatório em todas as queries.
 */

import { db } from "@flow-os/db";
import { decrypt } from "@/lib/encrypt";
import { normalizeEvolutionApiBaseUrl } from "@/lib/evolution";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChannelType = "RC" | "WA" | "WA_EVOLUTION" | "WA_GROUP" | "EMAIL" | "SMS" | "PWA" | "INTERNAL";

export interface ChatTagBadge {
  id:       string;
  descricao: string;
  corFundo: string;
  corTexto: string;
}

export interface Conversation {
  id:             string;   // Task.id
  dealId:         string | null;
  protocolId:     string | null;
  protocolNumber: string | null;
  dealTitle:      string;
  dealRef:        string | null;  // Deal.meta.dealRef — referência genérica
  contactId:      string | null;
  contactName:    string;
  contactPhone:   string | null;
  channel:        ChannelType;
  roomId:         string | null;
  lastMessage:    string;
  lastAt:         number;
  unread:         boolean;
  unreadCount:    number;
  quadrant:       string;
  eisenhower:     string | null;  // alias de quadrant para uso na UI
  aparelhoOrigem: string | null;  // ChatSession.aparelhoOrigem
  tags:           ChatTagBadge[]; // always [] — no schema relation yet
  // ChatSession fields
  status:         string;
  responsavelId:  string | null;
  departamentoId: string | null;
  chatbotAtivo:   boolean;
  arquivado:      boolean;
  favorito:       boolean;
}

export interface ChatMediaAttachment {
  kind:     "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
  url:      string;
  fileName?: string;
  mimeType?: string;
}

export interface ChatMessage {
  id:        string;
  direction: "IN" | "OUT";
  channel:   ChannelType;
  text:      string;
  sentAt:    number;
  author:    string;
  media?:    ChatMediaAttachment;
}

export interface HistoricoEntry {
  id:      string;
  status:  string;
  autorId: string | null;
  ts:      number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function detectChannel(input: unknown): ChannelType {
  const s = String(input ?? "").toUpperCase();
  if (s.includes("WA_GROUP") || s.includes("GROUP"))         return "WA_GROUP";
  if (s.includes("WA_EVOLUTION") || s.includes("EVOLUTION")) return "WA_EVOLUTION";
  if (s.includes("WHATSAPP") || s === "WA")                  return "WA";
  if (s.includes("ROCKET") || s === "RC")                    return "RC";
  if (s.includes("EMAIL"))                                   return "EMAIL";
  if (s.includes("SMS"))                                     return "SMS";
  if (s.includes("PWA") || s.includes("PORTAL"))             return "PWA";
  return "INTERNAL";
}

/** Exibe apenas os últimos 4 dígitos do telefone, e.g. "…9999" */
export function maskPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `…${digits.slice(-4)}` : phone;
}

function parseChatMedia(raw: unknown): ChatMediaAttachment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const url = typeof o["url"] === "string" ? o["url"] : "";
  if (!url) return undefined;
  const kind = String(o["kind"] ?? "DOCUMENT");
  const k: ChatMediaAttachment["kind"] =
    kind === "IMAGE" || kind === "AUDIO" || kind === "VIDEO" || kind === "DOCUMENT" ? kind : "DOCUMENT";
  return {
    kind: k,
    url,
    ...(typeof o["fileName"] === "string" ? { fileName: o["fileName"] } : {}),
    ...(typeof o["mimeType"] === "string" ? { mimeType: o["mimeType"] } : {}),
  };
}

function channelForChatLog(log: { action: string; input: unknown }): ChannelType {
  const inp = (log.input as Record<string, unknown> | null) ?? {};
  const fromInput = String(inp["channel"] ?? "");
  if (fromInput) return detectChannel(fromInput);
  if (log.action === "webhook_evolution") return "WA_EVOLUTION";
  if (log.action.includes("evolution")) return "WA_EVOLUTION";
  if (log.action.includes("whatsapp") || log.action === "webhook_whatsapp") return "WA";
  if (log.action.includes("rocket") || log.action === "webhook_rocket") return "RC";
  return "INTERNAL";
}

function evolutionTextFromMessage(msg: Record<string, unknown>): string {
  const conversation = msg["conversation"];
  if (typeof conversation === "string" && conversation.trim()) return conversation;

  const extendedText = msg["extendedTextMessage"];
  if (extendedText && typeof extendedText === "object") {
    const text = (extendedText as Record<string, unknown>)["text"];
    if (typeof text === "string" && text.trim()) return text;
  }

  const mediaKinds = [
    { key: "imageMessage", label: "IMAGE" },
    { key: "audioMessage", label: "AUDIO" },
    { key: "videoMessage", label: "VIDEO" },
    { key: "documentMessage", label: "DOCUMENT" },
    { key: "stickerMessage", label: "STICKER" },
  ] as const;
  for (const mediaKind of mediaKinds) {
    const media = msg[mediaKind.key];
    if (!media || typeof media !== "object") continue;
    const caption = (media as Record<string, unknown>)["caption"];
    if (typeof caption === "string" && caption.trim()) return caption;
    return `[${mediaKind.label}]`;
  }

  return "";
}

function extractEvolutionMessagesFromFindMessages(payload: unknown): Record<string, unknown>[] {
  const tryArray = (value: unknown): Record<string, unknown>[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  };

  const rootArray = tryArray(payload);
  if (rootArray.length > 0) return rootArray;
  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  const candidates = [
    root["messages"],
    root["data"],
    root["results"],
    (root["data"] as Record<string, unknown> | undefined)?.["messages"],
    (root["response"] as Record<string, unknown> | undefined)?.["messages"],
    (root["response"] as Record<string, unknown> | undefined)?.["data"],
  ];
  for (const candidate of candidates) {
    const arr = tryArray(candidate);
    if (arr.length > 0) return arr;
  }

  return [];
}

async function fetchEvolutionMessagesFallback(taskId: string, workspaceId: string): Promise<ChatMessage[]> {
  const task = await db.task.findFirst({
    where: { id: taskId, workspaceId },
    select: {
      channel: true,
      groupId: true,
      description: true,
      deal: {
        select: {
          contact: {
            select: { phone: true, name: true },
          },
        },
      },
    },
  });
  if (!task) return [];

  let descriptionMeta: Record<string, unknown> = {};
  try {
    descriptionMeta = JSON.parse(task.description ?? "{}") as Record<string, unknown>;
  } catch {
    descriptionMeta = {};
  }

  const chatSession = await db.chatSession.findFirst({
    where: { taskId, workspaceId },
    select: { aparelhoOrigem: true },
  });

  const instanceHints = [
    String(chatSession?.aparelhoOrigem ?? "").trim(),
    String(descriptionMeta["instanceName"] ?? "").trim(),
  ].filter(Boolean);

  const integration = await db.workspaceIntegration.findFirst({
    where: {
      workspaceId,
      type: "WHATSAPP_EVOLUTION",
      status: "ACTIVE",
      ...(instanceHints.length > 0
        ? {
            OR: [
              ...instanceHints.map((hint) => ({ config: { path: ["EVOLUTION_INSTANCE_NAME"], equals: hint } })),
              ...instanceHints.map((hint) => ({ config: { path: ["instanceName"], equals: hint } })),
            ],
          }
        : {}),
    },
    select: { config: true },
  });
  if (!integration) return [];

  const cfg = (integration.config ?? {}) as Record<string, string>;
  const instanceName = cfg["EVOLUTION_INSTANCE_NAME"] ?? cfg["instanceName"] ?? String(chatSession?.aparelhoOrigem ?? descriptionMeta["instanceName"] ?? "");
  if (!instanceName) return [];

  const apiUrl = normalizeEvolutionApiBaseUrl(
    cfg["EVOLUTION_API_URL"] ??
      cfg["apiUrl"] ??
      process.env["EVOLUTION_API_URL"] ??
      "http://localhost:8080",
  );
  const apiKey = cfg["apiKey"]
    ? (() => {
        try {
          return decrypt(cfg["apiKey"]);
        } catch {
          return process.env["EVOLUTION_API_KEY"] ?? "";
        }
      })()
    : (process.env["EVOLUTION_API_KEY"] ?? "");
  if (!apiKey) return [];

  const isGroupChannel = String(task.channel ?? "").toUpperCase() === "WA_GROUP";
  const groupJid = String(descriptionMeta["groupJid"] ?? "");
  const groupId = String(task.groupId ?? descriptionMeta["groupId"] ?? "");
  const phone = String(descriptionMeta["phone"] ?? task.deal?.contact?.phone ?? "");
  const remoteJid = isGroupChannel
    ? (groupJid || (groupId ? `${groupId}@g.us` : ""))
    : (phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@s.whatsapp.net`);
  if (!remoteJid) return [];

  const response = await fetch(`${apiUrl}/chat/findMessages/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      where: { key: { remoteJid } },
      page: 1,
      offset: 50,
    }),
    cache: "no-store",
  });
  if (!response.ok) return [];

  const json = (await response.json().catch(() => null)) as unknown;
  const entries = extractEvolutionMessagesFromFindMessages(json);
  if (entries.length === 0) return [];

  const mapped = entries.map((entry) => {
    const key = (entry["key"] as Record<string, unknown> | undefined) ?? {};
    const message = (entry["message"] as Record<string, unknown> | undefined) ?? {};
    const tsRaw = entry["messageTimestamp"];
    const ts = typeof tsRaw === "number"
      ? (tsRaw > 10_000_000_000 ? tsRaw : tsRaw * 1000)
      : Date.now();

    const text = evolutionTextFromMessage(message) || "[mensagem]";
    const fromMe = key["fromMe"] === true;

    return {
      id: String(key["id"] ?? `${taskId}:${ts}`),
      direction: (fromMe ? "OUT" : "IN") as "IN" | "OUT",
      channel: isGroupChannel ? "WA_GROUP" : "WA_EVOLUTION",
      text,
      sentAt: ts,
      author: fromMe ? "FlowOS" : String(entry["pushName"] ?? descriptionMeta["name"] ?? task.deal?.contact?.name ?? "Cliente"),
    } satisfies ChatMessage;
  });

  return mapped
    .sort((a, b) => a.sentAt - b.sentAt)
    .filter((msg, idx, arr) => arr.findIndex((m) => m.id === msg.id) === idx);
}

// ─── Name / Preview helpers ───────────────────────────────────────────────────

/** Limpa nomes técnicos (@lid, IDs numéricos puros) → fallback para telefone formatado. */
function cleanContactName(rawName: string, phone: string): string {
  const n = rawName.trim();
  const isRawId = n.includes("@lid") || n.includes("@g.us") || n.includes("@s.whatsapp.net") || /^\d{10,}$/.test(n);
  if (isRawId || n === "") {
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits.slice(-11)}` : "Contato WA";
  }
  return n;
}

/** Preview unificado: rawText > mídia placeholder > título da task. */
function cleanLastMessage(meta: Record<string, unknown>, taskTitle: string | null): string {
  const raw = String(meta["rawText"] ?? "").trim();
  // Normaliza placeholders legados para formato único
  if (/^\[(?:image|video|audio|mídia|media|file|document|sticker)\]$/i.test(raw)) return "📎 [mídia]";
  if (raw) return raw;
  if (meta["mediaKind"] || meta["media"]) return "📎 [mídia]";
  return taskTitle ?? "";
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Lista de conversas ativas, enriquecida com aparelhoOrigem, eisenhower, dealRef.
 * [SEC-03] WHERE workspaceId obrigatório.
 */
/** Valores persistidos em `Task.channel` alinhados ao JSON em `description` (lista de conversas). */
const CHAT_TASK_CHANNELS = ["WA", "RC", "WA_EVOLUTION", "WA_GROUP", "PWA"] as const satisfies readonly ChannelType[];

export async function getConversations(workspaceId: string): Promise<Conversation[]> {
  // Usa campo indexado Task.channel em vez de LIKE no description (elimina seq scan)
  const tasks = await db.task.findMany({
    where: {
      workspaceId,
      completedAt: null,
      channel: { in: [...CHAT_TASK_CHANNELS] },
    },
    orderBy: { updatedAt: "desc" },
    take:    200,
    include: {
      deal: {
        include: {
          contact: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  const taskIds = tasks.map(t => t.id);

  const [sessions, protocols] = await Promise.all([
    taskIds.length > 0
      ? db.chatSession.findMany({ where: { taskId: { in: taskIds }, workspaceId } })
      : Promise.resolve([]),
    taskIds.length > 0
      ? db.protocol.findMany({
          where:   { taskId: { in: taskIds }, workspaceId },
          orderBy: { createdAt: "desc" },
          select:  { id: true, taskId: true, number: true },
        })
      : Promise.resolve([]),
  ]);

  const sessionByTask  = Object.fromEntries(sessions.map(s => [s.taskId, s]));
  const protocolByTask = Object.fromEntries(
    protocols.map(p => [p.taskId ?? p.id, p]),
  );

  const seen = new Set<string>();
  const conversations: Conversation[] = [];

  for (const task of tasks) {
    const dealId = task.dealId ?? task.id;
    if (seen.has(dealId)) continue;
    seen.add(dealId);

    let descMeta: Record<string, unknown> = {};
    try { descMeta = JSON.parse(task.description ?? "{}") as Record<string, unknown>; }
    catch { /* not JSON */ }

    const rawChannel = String(task.channel ?? descMeta["channel"] ?? "");
    const channel    = detectChannel(rawChannel);
    const roomId     = String(descMeta["roomId"] ?? descMeta["rocketRoomId"] ?? "");
    const session    = sessionByTask[task.id] ?? null;
    const protocol   = protocolByTask[task.id] ?? null;

    // dealRef: generic reference key from meta (sector-neutral)
    const rawMeta = (task.deal?.meta ?? {}) as Record<string, unknown>;
    const dealRef = String(rawMeta["dealRef"] ?? rawMeta["imovelId"] ?? "");

    conversations.push({
      id:             task.id,
      dealId:         task.dealId ?? null,
      protocolId:     protocol?.id ?? null,
      protocolNumber: protocol?.number ?? null,
      dealTitle:      task.deal?.title ?? task.title ?? "Sem título",
      dealRef:        dealRef || null,
      contactId:      task.deal?.contact?.id ?? null,
      contactName:    cleanContactName(
        String(descMeta["groupName"] ?? descMeta["name"] ?? task.deal?.contact?.name ?? ""),
        String(descMeta["phone"] ?? task.deal?.contact?.phone ?? ""),
      ),
      contactPhone:   String(descMeta["phone"] ?? task.deal?.contact?.phone ?? ""),
      channel,
      roomId:         roomId || null,
      lastMessage:    cleanLastMessage(descMeta, task.title),
      lastAt:         task.updatedAt.getTime(),
      unread:         (session?.unreadCount ?? 0) > 0 || task.quadrant === "Q1_DO",
      unreadCount:    session?.unreadCount ?? 0,
      quadrant:       task.quadrant,
      eisenhower:     task.quadrant ?? null,
      aparelhoOrigem: session?.aparelhoOrigem ?? String(descMeta["instanceName"] ?? ""),
      tags:           [],  // no schema relation — loaded separately via /api/tags
      status:         session?.status ?? "ABERTO",
      responsavelId:  session?.responsavelId ?? null,
      departamentoId: session?.departamentoId ?? null,
      chatbotAtivo:   session?.chatbotAtivo ?? true,
      arquivado:      session?.arquivado ?? false,
      favorito:       session?.favorito ?? false,
    });
  }

  return conversations;
}

/**
 * Histórico de mensagens de uma task.
 * [SEC-03] WHERE workspaceId obrigatório.
 */
export async function getMessages(taskId: string, workspaceId: string): Promise<ChatMessage[]> {
  const [inLogs, outLogs] = await Promise.all([
    db.agentAuditLog.findMany({
      where: {
        workspaceId,
        action: {
          in: [
            "webhook_whatsapp", "webhook_evolution", "webhook_rocket",
            "whatsapp_send_text", "whatsapp_send_template",
            "chat_send_wa", "chat_send_rc",
          ],
        },
        output: { path: ["taskId"], equals: taskId },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    db.agentAuditLog.findMany({
      where: {
        workspaceId,
        action: { in: ["whatsapp_send_text", "whatsapp_send_template", "chat_send_wa", "chat_new_conversation"] },
        input:  { path: ["taskId"], equals: taskId },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
  ]);

  const all = [...inLogs, ...outLogs]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .filter((log, i, arr) => arr.findIndex(l => l.id === log.id) === i);

  if (all.length === 0) {
    return fetchEvolutionMessagesFallback(taskId, workspaceId);
  }

  return all.map(log => {
    const inp   = (log.input  as Record<string, unknown> | null) ?? {};
    const out   = (log.output as Record<string, unknown> | null) ?? {};
    const isOut = log.action.includes("send") || log.action.includes("chat_new");
    const media = parseChatMedia(out["media"]);
    return {
      id:        log.id,
      direction: (isOut ? "OUT" : "IN") as "IN" | "OUT",
      channel:   isOut
        ? detectChannel(String(inp["channel"] ?? (log.action.includes("whatsapp") ? "WA" : "RC")))
        : channelForChatLog(log),
      text:      String(out["text"] ?? inp["rawText"] ?? inp["raw"] ?? log.action),
      sentAt:    log.createdAt.getTime(),
      author:    isOut ? "FlowOS" : String(inp["name"] ?? inp["actorId"] ?? "Cliente"),
      ...(media ? { media } : {}),
    } satisfies ChatMessage;
  });
}

/**
 * Histórico de status de atendimento (aba 2 da sidebar).
 */
export async function getSessionHistorico(taskId: string, workspaceId: string): Promise<HistoricoEntry[]> {
  const logs = await db.agentAuditLog.findMany({
    where: {
      workspaceId,
      action: {
        in: ["chat.session.status.update", "chat.session.info.update", "chat.session.delegate"],
      },
      input: { path: ["taskId"], equals: taskId },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return logs.map(log => {
    const inp = (log.input as Record<string, unknown> | null) ?? {};
    return {
      id:      log.id,
      status:  String(inp["status"] ?? log.action),
      autorId: String(inp["agentId"] ?? log.agentId ?? "sistema"),
      ts:      log.createdAt.getTime(),
    };
  });
}

/**
 * Histórico fallback por dealId.
 */
export async function getChatHistory(workspaceId: string, dealId: string): Promise<ChatMessage[]> {
  const logs = await db.agentAuditLog.findMany({
    where: {
      workspaceId,
      OR: [
        { action: { contains: "webhook" } },
        { action: { contains: "send" } },
        { action: { contains: "message" } },
        { action: { contains: "payment_recovery" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return logs
    .filter(log => {
      const inp = log.input as Record<string, unknown> | null;
      return inp && (inp["dealId"] === dealId || inp["roomId"]);
    })
    .map(log => {
      const inp   = (log.input  as Record<string, unknown> | null) ?? {};
      const out   = (log.output as Record<string, unknown> | null) ?? {};
      const isOut = log.action.includes("send") || log.action.includes("payment");
      return {
        id:        log.id,
        direction: isOut ? "OUT" : "IN",
        channel:   detectChannel(inp["source"] ?? inp["channel"]),
        text:      String(out["text"] ?? inp["raw"] ?? inp["message"] ?? log.action),
        sentAt:    log.createdAt.getTime(),
        author:    isOut ? "FlowOS" : String(inp["actorId"] ?? "Cliente"),
      } satisfies ChatMessage;
    });
}
