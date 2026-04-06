"use client";

/**
 * FlowOS v4 — Chat Omnichannel
 * Split-view: lista de conversas (esq) + janela de chat (centro) + sidebar (dir)
 */

import { useState, useEffect, useRef, useCallback, useTransition, type ChangeEvent } from "react";
import type { Conversation, ChatMessage, ChannelType, ChatMediaAttachment } from "../_lib/chat-queries";
import { maskPhone } from "../_lib/chat-queries";
import { ChatSidebar } from "./ChatSidebar";
import { ChatFilters, DEFAULT_FILTERS, applyFilters, type Filters } from "./ChatFilters";
import { ProtocolModal } from "@/components/protocol-modal";

// ─── Constantes de status ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cor: string }> = {
  ABERTO:         { label: "Aberto",          cor: "#ef4444" },
  EM_ATENDIMENTO: { label: "Em Atendimento",  cor: "#22c55e" },
  AGUARDANDO:     { label: "Aguardando",       cor: "#f59e0b" },
  RESOLVIDO:      { label: "Resolvido",        cor: "#3b82f6" },
  FECHADO:        { label: "Fechado",          cor: "#6b7280" },
  INDEFINIDO:     { label: "Indefinido",       cor: "#d1d5db" },
};

const STATUS_DESCS: Record<string, string> = {
  ABERTO:         "Nova conversa ou reiniciada",
  EM_ATENDIMENTO: "Cliente está sendo atendido",
  AGUARDANDO:     "Aguardando uma ação sua ou do cliente",
  RESOLVIDO:      "Cliente foi atendido e problema resolvido",
  FECHADO:        "Atendimento encerrado sem conclusão",
};

// ─── Helpers visuais ──────────────────────────────────────────────────────────

const CHANNEL_BADGE: Record<ChannelType, { label: string; bg: string; text: string }> = {
  RC:           { label: "RC",   bg: "bg-orange-900/50",  text: "text-orange-300"  },
  WA:           { label: "WA",   bg: "bg-green-900/50",   text: "text-green-300"   },
  WA_EVOLUTION: { label: "WA",   bg: "bg-green-900/50",   text: "text-green-300"   },
  WA_GROUP:     { label: "GRP",  bg: "bg-teal-900/50",    text: "text-teal-300"    },
  EMAIL:        { label: "EM",   bg: "bg-blue-900/50",    text: "text-blue-300"    },
  SMS:          { label: "SM",   bg: "bg-purple-900/50",  text: "text-purple-300"  },
  PWA:          { label: "PWA",  bg: "bg-indigo-900/50",  text: "text-indigo-300"  },
  INTERNAL:     { label: "INT",  bg: "bg-gray-800",       text: "text-gray-400"    },
};

// Grupos de canais para exibição agrupada
const CHANNEL_GROUPS: Array<{ label: string; channels: ChannelType[] }> = [
  { label: "WHATSAPP",  channels: ["WA", "WA_EVOLUTION"] },
  { label: "GRUPOS",    channels: ["WA_GROUP"] },
  { label: "PORTAL",    channels: ["PWA"] },
  { label: "OUTROS",    channels: ["RC", "EMAIL", "SMS", "INTERNAL"] },
];

const QUADRANT_DOT: Record<string, string> = {
  Q1_DO:        "bg-red-500",
  Q2_PLAN:      "bg-blue-500",
  Q3_DELEGATE:  "bg-yellow-500",
  Q4_ELIMINATE: "bg-gray-600",
};

/** Paleta tipo WhatsApp Web — avatar por hash do nome */
const AVATAR_COLORS = [
  "#25D366",
  "#128C7E",
  "#075E54",
  "#34B7F1",
  "#ECE5DD",
  "#00BFA5",
  "#7C4DFF",
  "#FF6D00",
];

function avatarColor(name: string): string {
  const n = name || "?";
  const i = n.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i]!;
}

/** Padrão de fundo sutil (painel de mensagens) */
const WA_CHAT_BG =
  'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27%3E%3Crect fill=%27%230B141A%27 width=%2748%27 height=%2748%27/%3E%3Ccircle cx=%276%27 cy=%278%27 r=%270.65%27 fill=%27%231a242b%27/%3E%3Ccircle cx=%2724%27 cy=%2718%27 r=%270.5%27 fill=%27%231f2c34%27/%3E%3Ccircle cx=%2738%27 cy=%2710%27 r=%270.55%27 fill=%27%231a242b%27/%3E%3Ccircle cx=%2714%27 cy=%2730%27 r=%270.5%27 fill=%27%231f2c34%27/%3E%3Ccircle cx=%2734%27 cy=%2734%27 r=%270.65%27 fill=%27%231a242b%27/%3E%3C/svg%3E")';

function ChannelPip({ channel }: { channel: ChannelType }) {
  const c = CHANNEL_BADGE[channel];
  return (
    <span
      style={{
        fontFamily:   'var(--font-mono)',
        fontSize:     '9px',
        fontWeight:   500,
        border:       '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding:      '1px 4px',
        background:   'transparent',
        color:        'var(--text-tertiary)',
      }}
    >
      {c.label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["INDEFINIDO"]!;
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: cfg.cor }}
      title={cfg.label}
    />
  );
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)     return "agora";
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ms).toLocaleDateString("pt-BR");
}

function initials(name: string): string {
  const cleaned = name.replace(/@\w+/g, "").replace(/[._\-]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(w => /[a-zA-ZÀ-ú]/.test(w));
  if (words.length === 0) return "WA";  // fallback — nunca mostra dígitos puros
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function dayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Três pontos “a escrever…” — só usado se `isTyping` existir no objeto conversa (opcional na API). */
function TypingDots({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] leading-none ${className ?? ""}`} style={{ color: 'var(--text-accent)' }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block animate-pulse"
          style={{ animationDelay: `${i * 180}ms`, animationDuration: "1.05s" }}
        >
          ●
        </span>
      ))}
    </span>
  );
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConvRow({
  conv, active, onClick,
}: { conv: Conversation; active: boolean; onClick: () => void }) {
  const aparelho = conv.aparelhoOrigem
    ? conv.aparelhoOrigem.length > 8
      ? conv.aparelhoOrigem.slice(0, 8)
      : conv.aparelhoOrigem
    : conv.contactPhone
      ? maskPhone(conv.contactPhone)
      : "";

  const convUi = conv as Conversation & {
    lastMessageFromMe?: boolean;
    lastMessageRead?: boolean;
    isTyping?: boolean;
  };
  const showTyping = Boolean(convUi.isTyping);
  const fromMePreview = Boolean(convUi.lastMessageFromMe);
  const readPreview = Boolean(convUi.lastMessageRead);

  const avBg = avatarColor(conv.contactName);
  const avFg =
    avBg === "#ECE5DD" ? "#111b21" : "#fff";

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex gap-2.5 items-start transition-colors duration-100 hover:[background:var(--surface-hover)]"
      style={{
        padding:      '10px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        borderLeft:   active ? '2px solid var(--text-accent)' : '2px solid transparent',
        background:   active ? 'var(--surface-active)' : undefined,
      }}
    >
      <div className="relative shrink-0 mt-0.5">
        <div
          className="w-8 h-8 flex items-center justify-center text-[11px] font-semibold shrink-0"
          style={{ backgroundColor: avBg + 'e6', color: avFg, borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)' }}
        >
          {initials(conv.contactName)}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-start gap-1">
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1">
              <StatusDot status={conv.status} />
              <span
                className="text-[13px] font-medium truncate"
                style={{ color: conv.unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
              >
                {conv.contactName}
              </span>
              {aparelho && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: 'var(--surface-overlay)', color: 'var(--text-tertiary)', padding: '1px 4px', borderRadius: 'var(--radius-sm)' }} className="shrink-0">{aparelho}</span>
              )}
            </div>
            {showTyping ? (
              <div className="mt-0.5 flex items-center min-h-[18px]">
                <TypingDots />
              </div>
            ) : (
              <p className="text-[12px] truncate leading-snug mt-0.5" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                {fromMePreview && (
                  <span style={{ color: readPreview ? "#53bdeb" : "#8696A0" }} className="mr-0.5">
                    ✓
                  </span>
                )}
                {conv.lastMessage}
              </p>
            )}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${QUADRANT_DOT[conv.quadrant] ?? "bg-gray-600"}`} />
              {conv.dealRef && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text-tertiary)' }} className="truncate max-w-[60px]">{conv.dealRef}</span>
              )}
              {conv.departamentoId && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: 'var(--surface-overlay)', color: 'var(--text-tertiary)', padding: '1px 4px', borderRadius: 'var(--radius-sm)' }} className="truncate max-w-[70px]">
                  {conv.departamentoId.slice(0, 6)}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-tertiary)' }} className="leading-none">{relTime(conv.lastAt)}</span>
            {conv.unreadCount > 0 && (
              <span
                className="shrink-0 flex items-center justify-center text-white font-semibold"
                style={{ minWidth: '18px', height: '18px', borderRadius: '9px', background: 'var(--color-whatsapp)', fontSize: '10px', padding: '0 5px', fontFamily: 'var(--font-mono)' }}
                title={`${conv.unreadCount} não lidas`}
              >
                {conv.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function mediaKindFromClientType(t: string): ChatMediaAttachment["kind"] {
  const m: Record<string, ChatMediaAttachment["kind"]> = {
    image: "IMAGE",
    audio: "AUDIO",
    video: "VIDEO",
    document: "DOCUMENT",
  };
  return m[t] ?? "DOCUMENT";
}

function mediaTypeFromMime(mime: string): "image" | "audio" | "video" | "document" {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isOut = msg.direction === "OUT";
  const m = msg.media;
  const msgUi = msg as ChatMessage & { delivery?: "sent" | "delivered" | "read" };
  const delivery = isOut ? (msgUi.delivery ?? "sent") : null;

  const bubbleRounded = isOut
    ? "rounded-tl-xl rounded-bl-xl rounded-br-xl rounded-tr-sm"
    : "rounded-tr-xl rounded-br-xl rounded-bl-xl rounded-tl-sm";
  const bubbleBg = isOut ? "" : "";  // handled by inline style below

  const linkCls = isOut ? "text-[#99ffdd]" : "text-[#53bdeb]";

  const tickEl =
    delivery === "read" ? (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-accent)', marginLeft: '4px' }}>✓✓</span>
    ) : delivery === "delivered" ? (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '4px' }}>✓✓</span>
    ) : (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '4px' }}>✓</span>
    );

  return (
    <div className={`flex mb-2 ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[60%] animate-msg-fadein ${bubbleRounded}`}
        style={{
          padding:         '8px 12px',
          fontFamily:      'var(--font-display)',
          fontSize:        '13px',
          lineHeight:      1.5,
          color:           'var(--text-primary)',
          background:      isOut ? '#1A1F3A' : 'var(--surface-overlay)',
          border:          isOut ? '1px solid rgba(124,106,247,0.15)' : '1px solid var(--border-subtle)',
        }}
      >
        {m?.kind === "IMAGE" && (
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="block mb-2 -mx-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt="" className="max-w-full rounded-md max-h-64 object-contain bg-black/20" />
          </a>
        )}
        {m?.kind === "VIDEO" && (
          <video src={m.url} controls className="max-w-full rounded-md max-h-64 mb-2 bg-black/30" />
        )}
        {m?.kind === "AUDIO" && (
          <audio src={m.url} controls className="w-full mb-2 max-h-10" />
        )}
        {m?.kind === "DOCUMENT" && (
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs underline break-all block mb-1 ${linkCls}`}
          >
            📎 {m.fileName ?? "Documento"}
          </a>
        )}
        {msg.text ? <p className="whitespace-pre-wrap break-words leading-snug">{msg.text}</p> : null}
        <div
          className="mt-1 flex flex-wrap items-end justify-end gap-x-1 gap-y-0 leading-none"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}
        >
          <span className="opacity-70 scale-90 origin-bottom-right">
            <ChannelPip channel={msg.channel} />
          </span>
          <span className="tabular-nums shrink-0">
            {new Date(msg.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isOut ? tickEl : null}
        </div>
      </div>
    </div>
  );
}

// ─── RC embed ─────────────────────────────────────────────────────────────────

function RocketChatFrame({ roomId }: { roomId: string }) {
  const rcUrl = process.env["NEXT_PUBLIC_ROCKET_URL"] ?? "";
  if (!rcUrl) return (
    <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <p className="text-2xl mb-2">💬</p>
        <p>Configure <code className="bg-gray-800 px-1 rounded text-xs">NEXT_PUBLIC_ROCKET_URL</code></p>
        <p className="text-xs text-gray-600 mt-1">Room ID: {roomId}</p>
      </div>
    </div>
  );
  return (
    <iframe
      src={`${rcUrl}/channel/${roomId}?layout=embedded`}
      className="flex-1 w-full border-0"
      allow="camera; microphone"
      title="Rocket.Chat"
    />
  );
}

// ─── Status dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({
  taskId, current, onChanged,
}: { taskId: string; current: string; onChanged: (s: string) => void }) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = async (status: string) => {
    setOpen(false);
    setSaving(true);
    try {
      const r = await fetch(`/api/chat/${taskId}/status`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status }),
      });
      if (r.ok) onChanged(status);
    } finally {
      setSaving(false);
    }
  };

  const cfg = STATUS_CONFIG[current] ?? STATUS_CONFIG["INDEFINIDO"]!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className="flex items-center gap-1.5 rounded transition-colors duration-150"
        style={{ padding: '2px 8px', fontSize: '11px', fontFamily: 'var(--font-display)', fontWeight: 500, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)' }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.cor }} />
        <span className="text-gray-300">{saving ? "…" : cfg.label}</span>
        <span className="text-gray-600 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-52 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          {Object.entries(STATUS_CONFIG).map(([key, s]) => (
            <button
              key={key}
              onClick={() => void select(key)}
              className="w-full flex items-start gap-2.5 px-3 py-2 transition-colors text-left hover:[background:var(--surface-hover)]"
              style={{ background: key === current ? 'var(--surface-active)' : undefined }}
            >
              <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: s.cor }} />
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{s.label}</p>
                {STATUS_DESCS[key] && (
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>{STATUS_DESCS[key]}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Respostas rápidas popup ──────────────────────────────────────────────────

interface Resposta { id: string; atalho: string; texto: string }

function QuickReplyPopup({
  query, contactFirstName, onSelect, onClose,
}: {
  query:            string;
  contactFirstName: string;
  onSelect:         (text: string) => void;
  onClose:          () => void;
}) {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [cursor,    setCursor]    = useState(0);

  useEffect(() => {
    const q = query.slice(1); // remove "/"
    fetch(`/api/respostas-rapidas?q=${encodeURIComponent(q)}`)
      .then(r => r.ok ? r.json() : { respostas: [] })
      .then((d: { respostas?: Resposta[] }) => { setRespostas(d.respostas ?? []); setCursor(0); })
      .catch(() => setRespostas([]));
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { setCursor(c => Math.min(c + 1, respostas.length - 1)); e.preventDefault(); }
      if (e.key === "ArrowUp")   { setCursor(c => Math.max(c - 1, 0)); e.preventDefault(); }
      if (e.key === "Enter" && respostas[cursor]) {
        e.preventDefault();
        applyTemplate(respostas[cursor]!.texto);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [respostas, cursor]);

  const applyTemplate = (texto: string) => {
    const result = texto
      .replace(/{PRIMEIRO_NOME_LEAD}/g, contactFirstName)
      .replace(/{DAY_GREETING}/g, dayGreeting());
    onSelect(result);
    onClose();
  };

  if (respostas.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
      {respostas.map((r, i) => (
        <button
          key={r.id}
          onMouseEnter={() => setCursor(i)}
          onClick={() => applyTemplate(r.texto)}
          className="w-full flex items-start gap-3 px-3 py-2 text-left transition-colors"
          style={{ background: i === cursor ? 'var(--surface-active)' : undefined }}
        >
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-accent)', fontWeight: 700 }} className="shrink-0 mt-0.5">/{r.atalho}</code>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)' }} className="truncate">{r.texto}</p>
        </button>
      ))}
    </div>
  );
}

// ─── Chat window ──────────────────────────────────────────────────────────────

function ChatWindow({
  conv,
  history,
  onMessageSent,
  onStatusChange,
  onSidebarToggle,
  sidebarOpen,
}: {
  conv:            Conversation;
  history:         ChatMessage[];
  onMessageSent:   (msg: ChatMessage) => void;
  onStatusChange:  (status: string) => void;
  onSidebarToggle: () => void;
  sidebarOpen:     boolean;
}) {
  const [text,      setText]     = useState("");
  const [mediaUrl,  setMediaUrl]  = useState("");
  const [mediaType, setMediaType] = useState<"image" | "audio" | "video" | "document">("image");
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [sending,   setSending]  = useState(false);
  const [error,     setError]    = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [useEmbed,  setUseEmbed] = useState(conv.channel === "RC" && !!conv.roomId);
  const [showQR,    setShowQR]   = useState(false);
  const [showProtocol, setShowProtocol] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const contactFirstName = conv.contactName.split(" ")[0] ?? conv.contactName;
  const convUi = conv as Conversation & { isTyping?: boolean };
  const headerTyping = Boolean(convUi.isTyping);
  const headerAv = avatarColor(conv.contactName);
  const headerAvFg = headerAv === "#ECE5DD" ? "#111b21" : "#fff";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  useEffect(() => {
    // Detectar "/" no início para mostrar popup
    setShowQR(text.startsWith("/") && text.length >= 1);
  }, [text]);

  const clearMedia = () => {
    setMediaUrl("");
    setMediaFileName(null);
  };

  const onMediaFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMediaUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/media/upload", { method: "POST", body: fd });
      const d = (await r.json()) as { url?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Falha no upload");
      if (!d.url) throw new Error("Resposta sem URL");
      setMediaUrl(d.url);
      setMediaType(mediaTypeFromMime(file.type || "application/octet-stream"));
      setMediaFileName(file.name || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload");
      clearMedia();
    } finally {
      setMediaUploading(false);
    }
  };

  const send = async () => {
    const wa = conv.channel !== "RC";
    const hasMedia = wa && mediaUrl.trim().length > 0;
    if ((!text.trim() && !hasMedia) || sending || mediaUploading) return;
    setSending(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        taskId:  conv.id,
        dealId:  conv.dealId,
        text:    text.trim(),
        channel: conv.channel === "RC" ? "RC" : "WA",
        roomId:  conv.roomId   ?? undefined,
        phone:   conv.contactPhone ?? undefined,
      };
      if (hasMedia) {
        body["media"] = {
          type: mediaType,
          url:  mediaUrl.trim(),
          ...(text.trim() ? { caption: text.trim() } : {}),
          ...(mediaFileName && mediaType === "document" ? { fileName: mediaFileName } : {}),
        };
      }
      const r = await fetch("/api/chat/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json() as { error?: string };
        throw new Error(d.error ?? "Erro ao enviar");
      }
      const optimistic: ChatMessage = {
        id:        `local-${Date.now()}`,
        direction: "OUT",
        channel:   conv.channel,
        text:      text.trim() || (hasMedia ? "" : ""),
        sentAt:    Date.now(),
        author:    "Você",
      };
      if (hasMedia) {
        optimistic.text = text.trim() || (mediaType === "document" ? "Documento" : "");
        optimistic.media = {
          kind: mediaKindFromClientType(mediaType),
          url:  mediaUrl.trim(),
          ...(mediaFileName ? { fileName: mediaFileName } : {}),
        };
      }
      onMessageSent(optimistic);
      setText("");
      clearMedia();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'var(--font-display)', background: 'var(--surface-base)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 shrink-0" style={{ height: '52px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-raised)' }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', backgroundColor: headerAv + 'e6', color: headerAvFg, fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600 }}
        >
          {initials(conv.contactName)}
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{conv.contactName}</p>
          {headerTyping ? (
            <div className="flex items-center gap-2 min-h-[18px] mt-0.5">
              <TypingDots />
            </div>
          ) : (
            <p className="truncate" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-tertiary)' }}>{conv.dealTitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ChannelPip channel={conv.channel} />
          {conv.protocolNumber && (
            <button
              type="button"
              onClick={() => setShowProtocol(true)}
              className="rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-1 text-[10px] font-semibold text-brand-300"
            >
              {conv.protocolNumber}
            </button>
          )}
          <StatusDropdown
            taskId={conv.id}
            current={conv.status}
            onChanged={onStatusChange}
          />
          {conv.channel === "RC" && conv.roomId && (
            <button
              onClick={() => setUseEmbed(e => !e)}
              className="rounded transition-colors duration-150 hover:[background:var(--surface-hover)]"
              style={{ fontFamily: 'var(--font-display)', fontSize: '11px', padding: '2px 8px', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'transparent' }}
            >
              {useEmbed ? "Histórico" : "Embed RC"}
            </button>
          )}
          <button
            onClick={onSidebarToggle}
            className="rounded transition-colors duration-150"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '2px 8px', border: '1px solid var(--border-default)', color: sidebarOpen ? 'var(--text-accent)' : 'var(--text-secondary)', background: sidebarOpen ? 'var(--surface-active)' : 'transparent' }}
            title="Painel lateral"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Content */}
      {useEmbed && conv.roomId ? (
        <RocketChatFrame roomId={conv.roomId} />
      ) : (
        <>
          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-0 min-h-0"
            style={{ background: 'var(--surface-base)' }}
          >
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                Nenhuma mensagem registrada ainda
              </div>
            ) : (
              history.map(msg => <Bubble key={msg.id} msg={msg} />)
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="px-4 py-3 shrink-0" style={{ background: 'var(--surface-raised)', borderTop: '1px solid var(--border-subtle)' }}>
            {error && <p className="text-xs mb-2 px-1" style={{ color: 'var(--color-q1)' }}>{error}</p>}
            {conv.channel !== "RC" && (
              <div className="flex flex-wrap items-center gap-2 mb-2" style={{ fontSize: '11px', fontFamily: 'var(--font-display)' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,application/pdf"
                  className="hidden"
                  onChange={e => { void onMediaFileChange(e); }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || mediaUploading}
                  title="Anexar imagem, vídeo, áudio ou PDF"
                  className="shrink-0 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:[background:var(--surface-hover)]"
                  style={{
                    width:      '36px',
                    height:     '36px',
                    border:     '1px solid var(--border-subtle)',
                    background: 'var(--surface-overlay)',
                    fontSize:   '16px',
                  }}
                  aria-label="Anexar arquivo"
                >
                  {mediaUploading ? "…" : "📎"}
                </button>
                {mediaUrl ? (
                  <div className="flex flex-1 min-w-0 items-center gap-2">
                    <span className="truncate" style={{ color: 'var(--text-secondary)' }} title={mediaFileName ?? mediaUrl}>
                      {mediaFileName ?? "Mídia anexada"}
                    </span>
                    <button
                      type="button"
                      onClick={clearMedia}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                      style={{ color: 'var(--color-q1)', border: '1px solid var(--border-subtle)' }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)' }} className="text-[10px]">
                    Imagem, vídeo, áudio ou PDF (até 25 MB)
                  </span>
                )}
              </div>
            )}
            <div className="relative flex gap-2 items-end">
              {showQR && (
                <div className="absolute bottom-full left-0 right-12 mb-1">
                  <QuickReplyPopup
                    query={text}
                    contactFirstName={contactFirstName}
                    onSelect={t => setText(t)}
                    onClose={() => setShowQR(false)}
                  />
                </div>
              )}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (showQR && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter")) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                rows={2}
                placeholder="Escreva uma mensagem"
                title={
                  conv.channel === "RC"
                    ? "Rocket.Chat — escreva / no início para respostas rápidas"
                    : "WhatsApp — escreva / no início para respostas rápidas"
                }
                className="flex-1 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
                style={{
                  background:    'var(--surface-overlay)',
                  border:        '1px solid var(--border-subtle)',
                  color:         'var(--text-primary)',
                  fontFamily:    'var(--font-display)',
                  minHeight:     '40px',
                  maxHeight:     '120px',
                  transition:    'border-color 150ms',
                }}
                onFocus={e  => { e.currentTarget.style.borderColor = 'var(--text-accent)'; }}
                onBlur={e   => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
              />
              <button
                type="button"
                onClick={() => { void send(); }}
                disabled={
                  (!text.trim() && !(conv.channel !== "RC" && mediaUrl.trim())) ||
                  sending ||
                  mediaUploading
                }
                title="Enviar"
                className="shrink-0 flex items-center justify-center rounded transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
                style={{
                  width:      '32px',
                  height:     '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: text.trim() || (conv.channel !== "RC" && mediaUrl.trim()) ? 'var(--text-accent)' : 'var(--surface-overlay)',
                  color:      'var(--text-primary)',
                  border:     '1px solid var(--border-subtle)',
                }}
                aria-label="Enviar"
              >
                {sending ? (
                  <span style={{ fontSize: '14px' }}>…</span>
                ) : (
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>→</span>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      <ProtocolModal
        open={showProtocol}
        protocolId={conv.protocolId}
        dealId={conv.dealId}
        onClose={() => setShowProtocol(false)}
      />
    </div>
  );
}

// ─── Device Status Footer ─────────────────────────────────────────────────────

interface DeviceStatus { id: string; name: string; instanceName: string; status: string }

function DeviceStatusFooter() {
  const [devices,  setDevices]  = useState<DeviceStatus[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [webhookId, setWebhookId] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [webhookUrl,  setWebhookUrl]  = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/integrations/evolution/status")
      .then(r => r.ok ? r.json() : { integrations: [] })
      .then((d: { integrations?: DeviceStatus[] }) => setDevices(d.integrations ?? []))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, []);

  const configureWebhook = async (id: string) => {
    setConfiguring(true);
    try {
      const r = await fetch("/api/integrations/evolution/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: id }),
      });
      const d = await r.json() as { ok?: boolean; webhookUrl?: string; error?: string };
      if (d.ok) { setWebhookUrl(d.webhookUrl ?? null); setWebhookId(id); }
    } finally {
      setConfiguring(false);
    }
  };

  if (loading) return (
    <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
      verificando…
    </div>
  );

  if (devices.length === 0) return (
    <div className="px-3 py-2 flex items-center gap-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-q1)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>nenhum número conectado</span>
    </div>
  );

  const connected = devices.filter(d => d.status === "open");

  return (
    <div className="px-3 py-1.5 space-y-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      {devices.map(d => (
        <div key={d.id} className="flex items-center gap-1.5">
          <span
            className={d.status === "open" ? "animate-pulse-dot" : ""}
            style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: d.status === "open" ? 'var(--color-success)' : 'var(--text-tertiary)', display: 'inline-block' }}
          />
          <span className="flex-1 truncate" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
            {d.instanceName || d.name} · {d.status === "open" ? "conectado" : d.status}
          </span>
          {d.status === "open" && webhookId !== d.id && (
            <button
              onClick={() => void configureWebhook(d.id)}
              disabled={configuring}
              className="rounded transition-colors duration-150"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-q3)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 4px', background: 'transparent' }}
              title="Configurar webhook para receber mensagens"
            >
              {configuring ? "…" : "⚠ webhook"}
            </button>
          )}
          {webhookId === d.id && webhookUrl && (
            <button
              onClick={() => void navigator.clipboard.writeText(webhookUrl)}
              className="rounded"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-success)', border: '1px solid rgba(34,197,94,0.3)', padding: '1px 4px', background: 'transparent' }}
              title={webhookUrl}
            >
              ✓ copiado
            </button>
          )}
        </div>
      ))}
      {connected.length === 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-tertiary)' }}>nenhum número em estado open</p>
      )}
    </div>
  );
}

// ─── Modal: Nova Conversa ─────────────────────────────────────────────────────

function NewConvModal({
  onClose,
  onCreated,
}: {
  onClose:   () => void;
  onCreated: (taskId: string, name: string, phone: string) => void;
}) {
  const [phone,   setPhone]   = useState("");
  const [name,    setName]    = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const submit = async () => {
    if (!phone.trim() || !message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/chat/new", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined, message: message.trim() }),
      });
      const d = await r.json() as { taskId?: string; name?: string; phone?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Erro ao criar conversa");
      onCreated(d.taskId!, d.name ?? phone, d.phone ?? phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-overlay)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-primary)',
    outline: 'none',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm mx-4 shadow-2xl" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Nova conversa WhatsApp</h2>
          <button onClick={onClose} style={{ color: 'var(--text-tertiary)', fontSize: '16px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.05em', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Telefone *</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="5511999999999"
              style={inputStyle}
            />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Com DDI. Ex: 5511999999999</p>
          </div>

          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.05em', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Nome (opcional)</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="João Silva"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.05em', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Mensagem *</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              rows={3}
              placeholder="Olá! Como posso ajudar?"
              style={{ ...inputStyle, resize: 'none' }}
            />
          </div>

          {error && <p style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--color-q1)', padding: '0 4px' }}>{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg transition-colors duration-150 hover:[background:var(--surface-hover)]"
              style={{ padding: '8px 16px', fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void submit()}
              disabled={!phone.trim() || !message.trim() || loading}
              className="flex-1 rounded-lg transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ padding: '8px 16px', fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 500, color: '#fff', background: 'var(--text-accent)', border: 'none', cursor: 'pointer' }}
            >
              {loading ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initial:     Conversation[];
  workspaceId: string;
}

export function ChatClient({ initial, workspaceId }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>(initial);
  const [activeId,      setActiveId]      = useState<string | null>(initial[0]?.id ?? null);
  const [history,       setHistory]       = useState<ChatMessage[]>([]);
  const [loadingHist,   setLoadingHist]   = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [filters,       setFilters]       = useState<Filters>(DEFAULT_FILTERS);
  const [showNewConv,   setShowNewConv]   = useState(false);
  const [tagsFiltersExpanded, setTagsFiltersExpanded] = useState(false);
  const [,              startTransition]  = useTransition();

  const activeConv = conversations.find(c => c.id === activeId) ?? null;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Carregar histórico ao trocar de conversa
  useEffect(() => {
    if (!activeConv) return;
    setLoadingHist(true);
    const param = `taskId=${activeConv.id}`;
    fetch(`/api/chat/history?${param}`)
      .then(r => r.ok ? r.json() : Promise.resolve([]))
      .then((data: ChatMessage[]) => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHist(false));
  }, [activeId, activeConv?.id]);

  // SSE para novas mensagens
  useEffect(() => {
    const es = new EventSource(`/api/sse/kanban`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data as string) as { type?: string; dealId?: string; taskId?: string };
        if (d.type === "DEAL_UPDATE" && d.dealId) {
          startTransition(() => {
            setConversations(prev =>
              prev.map(c => c.dealId === d.dealId
                ? { ...c, lastAt: Date.now(), unread: true, unreadCount: c.unreadCount + 1 }
                : c,
              ).sort((a, b) => b.lastAt - a.lastAt),
            );
          });
        }
        if (d.type === "NEW_MESSAGE" && d.taskId) {
          startTransition(() => {
            setConversations(prev =>
              prev.map(c => c.id === d.taskId
                ? { ...c, lastAt: Date.now(), unread: true, unreadCount: c.unreadCount + 1 }
                : c,
              ).sort((a, b) => b.lastAt - a.lastAt),
            );
          });
          if (activeIdRef.current === d.taskId) {
            void fetch(`/api/chat/history?taskId=${d.taskId}`)
              .then(r => (r.ok ? r.json() : Promise.resolve([])))
              .then((data: ChatMessage[]) => { setHistory(data); })
              .catch(() => undefined);
          }
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  const handleMessageSent = useCallback((msg: ChatMessage) => {
    setHistory(prev => [...prev, msg]);
  }, []);

  const handleStatusChange = useCallback((status: string) => {
    setConversations(prev =>
      prev.map(c => c.id === activeId ? { ...c, status } : c),
    );
  }, [activeId]);

  const handleSidebarUpdate = useCallback((patch: Partial<Conversation>) => {
    setConversations(prev =>
      prev.map(c => c.id === activeId ? { ...c, ...patch } : c),
    );
  }, [activeId]);

  const handleNewConvCreated = useCallback((taskId: string, name: string, phone: string) => {
    setShowNewConv(false);
    const newConv: Conversation = {
      id:             taskId,
      dealId:         null,
      protocolId:     null,
      protocolNumber: null,
      dealTitle:      `Conversa WA — ${name}`,
      dealRef:        null,
      contactId:      null,
      contactName:    name,
      contactPhone:   phone,
      channel:        "WA",
      roomId:         null,
      lastMessage:    "Mensagem enviada",
      lastAt:         Date.now(),
      unread:         false,
      unreadCount:    0,
      quadrant:       "Q2_PLAN",
      eisenhower:     "Q2_PLAN",
      aparelhoOrigem: null,
      tags:           [],
      status:         "EM_ATENDIMENTO",
      responsavelId:  null,
      departamentoId: null,
      chatbotAtivo:   false,
      arquivado:      false,
      favorito:       false,
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveId(taskId);
  }, []);

  const filtered = applyFilters(conversations, filters);

  return (
    <>
    {showNewConv && (
      <NewConvModal
        onClose={() => setShowNewConv(false)}
        onCreated={handleNewConvCreated}
      />
    )}
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
      {/* ── Lista de conversas ──────────────────────────────────────── */}
      <aside className="shrink-0 flex flex-col" style={{ width: '300px', background: 'var(--surface-raised)', borderRight: '1px solid var(--border-subtle)' }}>
        {/* Header */}
        <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="flex-1" style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Chat</h1>
            {conversations.reduce((n, c) => n + c.unreadCount, 0) > 0 && (
              <span style={{ background: 'var(--color-q1)', borderRadius: '99px', fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, color: '#fff', padding: '1px 5px' }}>
                {conversations.reduce((n, c) => n + c.unreadCount, 0)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setTagsFiltersExpanded(v => !v)}
              className="flex items-center rounded-lg transition-colors duration-150 hover:[background:var(--surface-hover)] shrink-0"
              style={{
                gap:          '4px',
                padding:      '4px 10px',
                fontFamily:   'var(--font-display)',
                fontSize:     '12px',
                fontWeight:   500,
                color:        tagsFiltersExpanded ? 'var(--text-accent)' : 'var(--text-secondary)',
                border:       `1px solid ${tagsFiltersExpanded ? 'var(--text-accent)' : 'var(--border-default)'}`,
                background:   tagsFiltersExpanded ? 'var(--surface-active)' : 'transparent',
                cursor:       'pointer',
              }}
              title={tagsFiltersExpanded ? "Ocultar filtros por tag" : "Mostrar filtros por tag"}
            >
              🏷 Filtros
            </button>
            <button
              onClick={() => setShowNewConv(true)}
              className="flex items-center rounded-lg transition-colors duration-150 hover:[background:var(--surface-hover)] shrink-0"
              style={{ gap: '2px', padding: '4px 10px', fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer' }}
            >
              + Nova
            </button>
          </div>
          <input
            value={filters.nome}
            onChange={e => setFilters(f => ({ ...f, nome: e.target.value }))}
            placeholder="Buscar conversa…"
            className="w-full rounded-lg px-2.5 py-1.5 focus:outline-none"
            style={{ background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Filters */}
        <ChatFilters
          filters={filters}
          onChange={setFilters}
          totalShown={filtered.length}
          tagsExpanded={tagsFiltersExpanded}
        />

        {/* Conversations — agrupadas por canal */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-5 text-center">
              <span className="text-3xl opacity-30">◫</span>
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {filters.nome ? "Nenhuma conversa encontrada" : "Nenhuma conversa ativa"}
                </p>
                {!filters.nome && (
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', lineHeight: 1.5 }}>
                    Mensagens aparecerão automaticamente quando chegarem.
                  </p>
                )}
              </div>
              {!filters.nome && (
                <button
                  onClick={() => setShowNewConv(true)}
                  className="rounded-lg transition-colors duration-150"
                  style={{ padding: '6px 16px', fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 500, color: '#fff', background: 'var(--text-accent)', border: 'none', cursor: 'pointer' }}
                >
                  + Nova conversa
                </button>
              )}
            </div>
          ) : (
            CHANNEL_GROUPS.map(group => {
              const groupConvs = filtered.filter(c => group.channels.includes(c.channel));
              if (groupConvs.length === 0) return null;
              return (
                <div key={group.label}>
                  <div className="sticky top-0 flex items-center gap-2 px-3 py-1 backdrop-blur-sm z-10" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-raised)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>({groupConvs.length})</span>
                  </div>
                  {groupConvs.map(conv => (
                    <ConvRow
                      key={conv.id}
                      conv={conv}
                      active={conv.id === activeId}
                      onClick={() => {
                        setActiveId(conv.id);
                        setConversations(prev =>
                          prev.map(c => c.id === conv.id ? { ...c, unread: false, unreadCount: 0 } : c),
                        );
                      }}
                    />
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Device status footer */}
        <DeviceStatusFooter />
      </aside>

      {/* ── Chat window ──────────────────────────────────────────────── */}
      <main className="flex-1 flex min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          {activeConv ? (
            loadingHist ? (
              <div className="flex-1 flex items-center justify-center h-full" style={{ background: 'var(--surface-base)' }}>
                <div className="flex items-center justify-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full animate-spin shrink-0"
                    style={{ border: '2px solid var(--border-default)', borderTopColor: 'var(--text-accent)' }}
                    aria-hidden
                  />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--text-tertiary)' }}>Carregando mensagens…</span>
                </div>
              </div>
            ) : (
              <ChatWindow
                conv={activeConv}
                history={history}
                onMessageSent={handleMessageSent}
                onStatusChange={handleStatusChange}
                onSidebarToggle={() => setSidebarOpen(o => !o)}
                sidebarOpen={sidebarOpen}
              />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3" style={{ background: 'var(--surface-base)' }}>
              <span style={{ fontSize: '32px', opacity: 0.15 }} aria-hidden>◫</span>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6, maxWidth: '240px' }}>
                Selecione uma conversa para começar
              </p>
            </div>
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        {sidebarOpen && activeConv && (
          <ChatSidebar
            conv={activeConv}
            onClose={() => setSidebarOpen(false)}
            onUpdate={handleSidebarUpdate}
          />
        )}
      </main>
    </div>
    </>
  );
}
