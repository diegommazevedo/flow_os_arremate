"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { CriticalDeal, ChannelBadge } from "../_lib/dashboard-queries";

// ─── Countdown Timer ──────────────────────────────────────────────────────────

function useCountdown(targetMs: number): string {
  const calc = useCallback(() => {
    const diff = targetMs - Date.now();
    if (diff <= 0) return "VENCIDO";
    const h  = Math.floor(diff / 3_600_000);
    const m  = Math.floor((diff % 3_600_000) / 60_000);
    const s  = Math.floor((diff % 60_000) / 1_000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [targetMs]);

  // Inicializa com placeholder para evitar mismatch SSR ↔ cliente
  // (Date.now() muda entre render servidor e hidratação)
  const [label, setLabel] = useState("--:--:--");

  useEffect(() => {
    setLabel(calc());
    const id = setInterval(() => setLabel(calc()), 1_000);
    return () => clearInterval(id);
  }, [calc]);

  return label;
}

// ─── Channel Badge ────────────────────────────────────────────────────────────

const PANEL =
  "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";
const PANEL_ALERT =
  "rounded-xl border border-red-900/50 bg-red-950/10 p-4 shadow-sm";

const CHANNEL_STYLES: Record<ChannelBadge, string> = {
  WA: "bg-green-900/60 text-green-400 border-green-800",
  EM: "bg-blue-900/60 text-blue-400 border-blue-800",
  CH: "bg-purple-900/60 text-purple-400 border-purple-800",
  RC: "bg-orange-900/60 text-orange-400 border-orange-800",
  SM: "bg-gray-800 text-gray-400 border-gray-700",
};

function ChannelPip({ ch }: { ch: ChannelBadge }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${CHANNEL_STYLES[ch]}`}
    >
      {ch}
    </span>
  );
}

// ─── Single Deal Row ──────────────────────────────────────────────────────────

function AlertRow({
  deal,
  onTakeOver,
}: {
  deal:       CriticalDeal;
  onTakeOver: (id: string) => void;
}) {
  const countdown = useCountdown(deal.paymentDeadlineMs);
  const isExpired = countdown === "VENCIDO";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-800 last:border-0 group">
      {/* Urgency pulse */}
      <span className="relative flex-shrink-0 w-2 h-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-50" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>

      {/* Deal info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{deal.title}</p>
        <p className="text-xs text-gray-400 truncate">{deal.actorName}</p>
      </div>

      {/* Countdown */}
      <span
        className={`font-mono text-sm font-bold tabular-nums flex-shrink-0 ${
          isExpired ? "text-red-400 animate-pulse" : "text-amber-400"
        }`}
      >
        {countdown}
      </span>

      {/* Channels */}
      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
        {deal.channels.map(ch => (
          <ChannelPip key={ch} ch={ch} />
        ))}
      </div>

      {/* Assignee avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
        style={{ backgroundColor: deal.assigneeColor }}
        title={deal.assigneeName}
      >
        {deal.assigneeInitials}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={() => onTakeOver(deal.id)}
          className="text-xs px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-700"
        >
          Assumir
        </button>
        <Link
          href={`/kanban?dealId=${deal.id}`}
          className="text-xs px-2.5 py-1 rounded bg-indigo-900/60 hover:bg-indigo-900 text-indigo-300 transition-colors border border-indigo-800"
        >
          Kanban ↗
        </Link>
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface Props {
  deals:      CriticalDeal[];
  q1Count:    number;
  q1WipLimit: number;
}

export function CriticalAlerts({ deals, q1Count, q1WipLimit }: Props) {
  const [localDeals, setLocalDeals] = useState<CriticalDeal[]>(deals);
  const isAtLimit = q1Count >= q1WipLimit;

  // Keep in sync when parent updates (SSE push)
  useEffect(() => { setLocalDeals(deals); }, [deals]);

  const handleTakeOver = useCallback((dealId: string) => {
    // Optimistic UI — real reatribuição via API POST /api/deals/[id]/assign
    console.log("[Dashboard] Take over deal:", dealId);
  }, []);

  if (localDeals.length === 0) {
    return (
      <div className={PANEL}>
        <SectionHeader q1Count={q1Count} q1WipLimit={q1WipLimit} isAtLimit={isAtLimit} />
        <div className="flex items-center gap-2 text-sm text-green-400 py-4">
          <span>✓</span>
          <span>Nenhum deal em Q1 — pipeline saudável.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={PANEL_ALERT}>
      <SectionHeader q1Count={q1Count} q1WipLimit={q1WipLimit} isAtLimit={isAtLimit} />

      <div className="mt-3">
        {localDeals.map(deal => (
          <AlertRow key={deal.id} deal={deal} onTakeOver={handleTakeOver} />
        ))}
      </div>

      {q1Count > localDeals.length && (
        <p className="text-xs text-gray-500 mt-3 text-right">
          + {q1Count - localDeals.length} deals Q1 adicionais — ver no Kanban
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  q1Count, q1WipLimit, isAtLimit,
}: {
  q1Count: number; q1WipLimit: number; isAtLimit: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-red-400 text-lg">🚨</span>
        <h2 className="font-semibold text-white">Alertas Críticos</h2>
        <span className="text-xs text-gray-500">Q1 — Fazer Agora</span>
      </div>
      <span
        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
          isAtLimit
            ? "bg-red-900/80 text-red-300 border-red-700 animate-pulse"
            : "bg-red-900/40 text-red-400 border-red-800"
        }`}
      >
        {q1Count} / {q1WipLimit}
        {isAtLimit && " ★ LIMITE"}
      </span>
    </div>
  );
}
