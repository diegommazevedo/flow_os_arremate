"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InternalChannelSummary } from "../_lib/internal-queries";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MsgAutor {
  name: string;
  role: string;
}

interface InternalMessage {
  id: string;
  autorId: string;
  autor?: MsgAutor;
  conteudo: string;
  tipo: string;
  dealId: string | null;
  protocolId: string | null;
  createdAt: string;
}

interface DealListItem {
  id:      string;
  title:   string;
  meta?:   Record<string, unknown>;
  contact?: { name: string } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function extractChb(deal: DealListItem): string {
  const meta = deal.meta as Record<string, unknown> | undefined;
  const metaChb = meta?.["chb"] ?? meta?.["imovelId"];
  if (typeof metaChb === "string" && metaChb.trim()) return metaChb.trim();
  const titleHead = deal.title.split(" - ")[0]?.trim();
  return titleHead && /^\d+$/.test(titleHead) ? titleHead : deal.id.slice(-8).toUpperCase();
}

function extractLeadLabel(deal: DealListItem): string {
  const meta = deal.meta as Record<string, unknown> | undefined;
  const titleParts = deal.title.split(" - ");
  const titleName = titleParts[1]?.trim();
  const city = typeof meta?.["cidade"] === "string" ? meta["cidade"] : undefined;
  const uf = typeof meta?.["uf"] === "string" ? meta["uf"] : undefined;
  const location = [city, uf].filter(Boolean).join("/");
  const baseName = deal.contact?.name ?? titleName ?? deal.title;
  return location ? `${baseName} — ${location}` : baseName;
}

function formatPhaseLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) => part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part)
    .join(" ");
}

const QUADRANT_COLOR: Record<string, string> = {
  Q1_DO:      "bg-red-900/60 text-red-300 border-red-800",
  Q2_PLAN:    "bg-blue-900/60 text-blue-300 border-blue-800",
  Q3_DELEGATE:"bg-amber-900/60 text-amber-300 border-amber-800",
  Q4_IGNORE:  "bg-gray-800 text-gray-400 border-gray-700",
};

// ─── DealPickerModal ──────────────────────────────────────────────────────────

function DealPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (deal: DealListItem) => void;
  onClose:  () => void;
}) {
  const [query,   setQuery]   = useState("");
  const [deals,   setDeals]   = useState<DealListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Foca o input ao abrir
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Carrega todos os deals uma vez
  useEffect(() => {
    setLoading(true);
    fetch("/api/deals/list")
      .then(r => r.ok ? r.json() : { deals: [] })
      .then((payload: { deals?: DealListItem[] }) => {
        setDeals(payload.deals ?? []);
        setLoading(false);
      })
      .catch(() => { setDeals([]); setLoading(false); });
  }, []);

  // Filtro client-side por título ou CHB
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return deals;
    return deals.filter(d =>
      d.title.toLowerCase().includes(q) ||
      extractChb(d).toLowerCase().includes(q)
    );
  }, [deals, query]);

  // Fechar ao pressionar Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Selecionar deal para thread</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-800 px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por título ou ID..."
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              {query ? "Nenhum deal encontrado." : "Nenhum deal disponível."}
            </div>
          ) : (
            filtered.map(deal => {
              const meta = deal.meta as Record<string, unknown> | undefined;
              const phase = meta?.["currentPhase"] ?? meta?.["kanbanStatus"];
              const quadrant = (meta?.["eisenhower"] ?? "") as string;
              const assignee = typeof meta?.["ownerId"] === "string"
                ? meta["ownerId"]
                : typeof meta?.["responsavel"] === "string"
                  ? meta["responsavel"]
                  : "—";
              const qStyle = QUADRANT_COLOR[quadrant] ?? "bg-gray-800 text-gray-400 border-gray-700";

              return (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => onSelect(deal)}
                  className="w-full rounded-xl border border-gray-800 bg-gray-800/50 px-4 py-3 text-left
                             transition-colors hover:border-brand-700 hover:bg-brand-900/20 mb-1.5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-gray-700 text-gray-300 border border-gray-600 font-mono">
                      {`CHB-${extractChb(deal)}`}
                    </span>
                    {quadrant && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${qStyle}`}>
                        {quadrant.replace("_DO","").replace("_PLAN","").replace("_DELEGATE","").replace("_IGNORE","")}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-white leading-snug truncate">{extractLeadLabel(deal)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{`Fase: ${formatPhaseLabel(phase)}`}</span>
                    <span>·</span>
                    <span>{quadrant ? quadrant.replace("_DO", "").replace("_PLAN", "").replace("_DELEGATE", "").replace("_IGNORE", "") : "—"}</span>
                    <span>·</span>
                    <span>{`Assignee: ${assignee}`}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Channel list item ────────────────────────────────────────────────────────

function ChannelItem({
  channel,
  active,
  onClick,
}: {
  channel: InternalChannelSummary;
  active:  boolean;
  onClick: () => void;
}) {
  const isAlert = channel.nome === "alertas-q1";
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-brand-500/10 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-white",
      ].join(" ")}
    >
      <span>{channel.tipo === "DIRETO" ? "👤" : channel.tipo === "DEAL_THREAD" ? "🧾" : "#"}</span>
      <span className="min-w-0 flex-1 truncate">{channel.dealTitle ?? channel.nome}</span>
      {channel.messageCount > 0 && (
        <span className={[
          "rounded-full px-2 py-0.5 text-[10px] font-bold",
          isAlert ? "bg-red-500 text-white" : "bg-gray-700 text-gray-200",
        ].join(" ")}>
          {channel.messageCount}
        </span>
      )}
    </button>
  );
}

// ─── Message card ─────────────────────────────────────────────────────────────

function MessageCard({ message }: { message: InternalMessage }) {
  const autorLabel = message.autor?.name ?? message.autorId.slice(0, 8);
  const roleLabel  = message.autor?.role && message.autor.role !== "SISTEMA"
    ? message.autor.role
    : null;

  if (message.tipo === "ALERTA_Q1") {
    return (
      <div className="rounded-2xl border border-red-900/40 bg-red-950/40 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-300">ALERTA Q1</div>
        <div className="text-sm text-white">{message.conteudo}</div>
        {message.dealId && (
          <Link href={`/deals/${message.dealId}`} className="mt-3 inline-block text-sm font-medium text-red-300">
            Ver deal →
          </Link>
        )}
      </div>
    );
  }

  if (message.tipo === "DEAL_REF") {
    return (
      <div className="rounded-2xl border border-blue-900/40 bg-blue-950/30 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-300">Deal</div>
        <div className="text-sm text-white">{message.conteudo}</div>
        {message.dealId && (
          <Link href={`/deals/${message.dealId}`} className="mt-3 inline-block text-sm font-medium text-blue-300">
            Abrir deal →
          </Link>
        )}
      </div>
    );
  }

  if (message.tipo === "PROTOCOL_REF") {
    return (
      <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/30 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">Protocolo</div>
        <div className="text-sm text-white">{message.conteudo}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-300">{autorLabel}</span>
        {roleLabel && (
          <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase bg-gray-800 text-gray-500 border border-gray-700">
            {roleLabel}
          </span>
        )}
        <span>·</span>
        <span>{formatDateTime(message.createdAt)}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm text-gray-100">{message.conteudo}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InternalChatClient({
  initialChannels,
  initialChannelId,
  initialDealId,
}: {
  initialChannels:  InternalChannelSummary[];
  initialChannelId: string | null;
  initialDealId:    string | null;
}) {
  const [channels,       setChannels]       = useState<InternalChannelSummary[]>(initialChannels);
  const [activeId,       setActiveId]       = useState<string | null>(initialChannelId ?? initialChannels[0]?.id ?? null);
  const [messages,       setMessages]       = useState<InternalMessage[]>([]);
  const [draft,          setDraft]          = useState("");
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [showDealPicker, setShowDealPicker] = useState(false);

  const activeChannel = channels.find(c => c.id === activeId) ?? null;

  const grouped = useMemo(() => ({
    public: channels.filter(c => c.tipo === "CANAL"),
    direct: channels.filter(c => c.tipo === "DIRETO"),
    deals:  channels.filter(c => c.tipo === "DEAL_THREAD"),
  }), [channels]);

  // Auto-open deal thread se veio com ?dealId
  useEffect(() => {
    if (!initialDealId || activeId) return;
    const existing = channels.find(c => c.dealId === initialDealId && c.tipo === "DEAL_THREAD");
    if (existing) { setActiveId(existing.id); return; }

    fetch("/api/internal/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: `deal-${initialDealId.slice(0, 8)}`, tipo: "DEAL_THREAD", dealId: initialDealId }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((payload: { channel?: InternalChannelSummary } | null) => {
        const ch = payload?.channel;
        if (!ch) return;
        setChannels(cur => [...cur, { id: ch.id, nome: ch.nome, tipo: ch.tipo, dealId: ch.dealId ?? initialDealId, dealTitle: ch.dealTitle ?? null, membros: ch.membros ?? [], messageCount: 0, latestAt: null }]);
        setActiveId(ch.id);
      })
      .catch(() => null);
  }, [initialDealId, activeId, channels]);

  // Buscar mensagens ao trocar canal
  useEffect(() => {
    if (!activeId) return;
    fetch(`/api/internal/channels/${activeId}/messages`)
      .then(r => r.ok ? r.json() : { messages: [] })
      .then((payload: { messages?: InternalMessage[] }) => setMessages(payload.messages ?? []))
      .catch(() => setMessages([]));
  }, [activeId]);

  // SSE para mensagens em tempo real
  useEffect(() => {
    if (!activeId) return;
    const es = new EventSource(`/api/sse/interno?channelId=${encodeURIComponent(activeId)}`);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as { type?: string; channelId?: string };
        if (payload.type === "HEARTBEAT") return;
        if (payload.channelId && payload.channelId !== activeId) return;
        fetch(`/api/internal/channels/${activeId}/messages`)
          .then(r => r.ok ? r.json() : { messages: [] })
          .then((data: { messages?: InternalMessage[] }) => setMessages(data.messages ?? []))
          .catch(() => null);
      } catch { /* noop */ }
    };
    return () => es.close();
  }, [activeId]);

  // Criar mensagem direta
  const createDirect = async () => {
    const target = window.prompt("IDs dos membros separados por vírgula");
    if (!target) return;
    const members = target.split(",").map(s => s.trim()).filter(Boolean);
    if (members.length === 0) return;
    const r = await fetch("/api/internal/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: `dm-${Date.now()}`, tipo: "DIRETO", membros: members }),
    });
    if (!r.ok) return;
    const payload = await r.json() as { channel: InternalChannelSummary };
    setChannels(cur => [...cur, { ...payload.channel, messageCount: 0, latestAt: null, dealTitle: null }]);
    setActiveId(payload.channel.id);
  };

  // Criar thread via picker
  const handleDealSelect = async (deal: DealListItem) => {
    setShowDealPicker(false);
    const existing = channels.find(c => c.dealId === deal.id && c.tipo === "DEAL_THREAD");
    if (existing) { setActiveId(existing.id); return; }

    const r = await fetch("/api/internal/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: `deal-${deal.id.slice(0, 8)}`, tipo: "DEAL_THREAD", dealId: deal.id }),
    });
    if (!r.ok) return;
    const payload = await r.json() as { channel: InternalChannelSummary };
    setChannels(cur => [...cur, {
      ...payload.channel,
      messageCount: 0,
      latestAt: null,
      dealTitle: payload.channel.dealTitle ?? deal.title,
    }]);
    setActiveId(payload.channel.id);
  };

  // Enviar mensagem
  const sendMessage = async () => {
    if (!activeId || !draft.trim()) return;
    const r = await fetch(`/api/internal/channels/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conteudo: draft, tipo: "TEXTO" }),
    });
    if (!r.ok) return;
    const payload = await r.json() as { message: InternalMessage };
    setMessages(cur => [...cur, payload.message]);
    setDraft("");
  };

  return (
    <>
      {showDealPicker && (
        <DealPickerModal
          onSelect={handleDealSelect}
          onClose={() => setShowDealPicker(false)}
        />
      )}

      <div className="-m-6 flex h-[calc(100vh-56px)] overflow-hidden bg-gray-950 text-white">
        {/* ── Sidebar ── */}
        <aside className={[
          "border-r border-gray-800 bg-gray-950 md:flex md:w-80 md:flex-col",
          sidebarOpen ? "absolute inset-y-0 left-0 z-40 flex w-80 flex-col" : "hidden",
        ].join(" ")}>
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Interno</div>
              <div className="text-xs text-gray-500">Chat da equipe</div>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} className="md:hidden">✕</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* Canais */}
            <div className="mb-4">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">Canais</div>
              <div className="space-y-1">
                {grouped.public.map(ch => (
                  <ChannelItem key={ch.id} channel={ch} active={ch.id === activeId} onClick={() => setActiveId(ch.id)} />
                ))}
              </div>
            </div>

            {/* Mensagens diretas */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
                <span>Mensagens diretas</span>
                <button type="button" onClick={() => { void createDirect(); }} className="text-brand-300">+ Nova</button>
              </div>
              <div className="space-y-1">
                {grouped.direct.map(ch => (
                  <ChannelItem key={ch.id} channel={ch} active={ch.id === activeId} onClick={() => setActiveId(ch.id)} />
                ))}
              </div>
            </div>

            {/* Deal threads */}
            <div>
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
                <span>Deal threads</span>
                <button
                  type="button"
                  onClick={() => setShowDealPicker(true)}
                  className="text-brand-300 hover:text-brand-200 transition-colors"
                >
                  + Nova
                </button>
              </div>
              <div className="space-y-1">
                {grouped.deals.map(ch => (
                  <ChannelItem key={ch.id} channel={ch} active={ch.id === activeId} onClick={() => setActiveId(ch.id)} />
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSidebarOpen(true)} className="md:hidden">☰</button>
              <div>
                <div className="text-sm font-semibold">
                  {activeChannel ? (activeChannel.dealTitle ?? activeChannel.nome) : "Selecione um canal"}
                </div>
                <div className="text-xs text-gray-500">
                  {activeChannel ? `${activeChannel.membros.length} membros` : "Sem canal ativo"}
                </div>
              </div>
            </div>
            {activeChannel && (
              <div className="text-xs text-gray-500">{activeChannel.tipo}</div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!activeChannel ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Selecione um canal da equipe.
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map(msg => (
                  <MessageCard key={msg.id} message={msg} />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-800 p-4">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sendMessage(); } }}
              rows={3}
              placeholder={activeChannel ? `Mensagem em #${activeChannel.nome}... (Ctrl+Enter para enviar)` : "Selecione um canal..."}
              className="w-full rounded-2xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-gray-500">@ menciona · # deal · / protocolo · Ctrl+↵ envia</div>
              <button
                type="button"
                disabled={!activeChannel || !draft.trim()}
                onClick={() => { void sendMessage(); }}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
