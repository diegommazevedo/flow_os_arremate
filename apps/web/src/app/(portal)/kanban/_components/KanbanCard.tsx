"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import type { KanbanDeal, ChannelBadge } from "./types";

// ─── SLA timer ────────────────────────────────────────────────────────────────

function useSlaTimer(deadlineMs: number) {
  // null = não montado ainda (evita mismatch SSR ↔ cliente)
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMsLeft(deadlineMs - Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  if (msLeft === null) {
    return { display: "--:--", isExpired: false, isUrgent: false, isWarning: false };
  }

  const isExpired = msLeft <= 0;
  const isUrgent  = msLeft > 0 && msLeft < 2 * 3_600_000;
  const isWarning = msLeft > 0 && msLeft < 6 * 3_600_000;

  const hours   = Math.max(0, Math.floor(msLeft / 3_600_000));
  const minutes = Math.max(0, Math.floor((msLeft % 3_600_000) / 60_000));
  const display = isExpired
    ? "VENCIDO"
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  return { display, isExpired, isUrgent, isWarning };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CHANNEL_META: Record<ChannelBadge, { label: string; className: string }> = {
  WA: { label: "WA", className: "bg-green-900/60 text-green-400 border-green-800" },
  EM: { label: "EM", className: "bg-blue-900/60 text-blue-400 border-blue-800" },
  CH: { label: "CH", className: "bg-indigo-900/60 text-indigo-400 border-indigo-800" },
  RC: { label: "RC", className: "bg-orange-900/60 text-orange-400 border-orange-800" },
  SM: { label: "SM", className: "bg-gray-800 text-gray-400 border-gray-700" },
};

function ChannelBadges({ channels }: { channels: ChannelBadge[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {channels.map((ch) => {
        const meta = CHANNEL_META[ch];
        return (
          <span
            key={ch}
            className={`text-[9px] font-bold px-1 py-0.5 rounded border ${meta.className}`}
          >
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

function PhaseBadge({ phase, color }: { phase: string; color: string }) {
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border"
      style={{
        backgroundColor: `${color}22`,
        color,
        borderColor: `${color}55`,
      }}
    >
      {phase}
    </span>
  );
}

function AssigneeAvatar({ name, color, initials }: { name: string; color: string; initials: string }) {
  return (
    <div
      title={name}
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  deal: KanbanDeal;
  isOverlay?: boolean;
}

export function KanbanCard({ deal, isOverlay = false }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { containerId: `${deal.quadrant}-${deal.status}`, deal },
    disabled: isOverlay,
  });

  const { display: slaDisplay, isExpired, isUrgent, isWarning } = useSlaTimer(deal.slaDeadlineMs);

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const formattedValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(deal.value);

  const slaClass = isExpired
    ? "text-red-500 font-bold animate-pulse"
    : isUrgent
    ? "text-red-400 font-bold"
    : isWarning
    ? "text-amber-400 font-semibold"
    : "text-gray-500";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={[
        "rounded-lg border border-gray-800 bg-gray-900 p-2.5 cursor-grab active:cursor-grabbing",
        "hover:border-gray-600 transition-colors select-none",
        isDragging && !isOverlay ? "opacity-40 border-dashed" : "",
        isOverlay ? "shadow-2xl ring-1 ring-white/10 rotate-1 scale-105" : "",
        deal.isCritical ? "ring-1 ring-red-500/40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Critical badge */}
      {deal.isCritical && (
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 uppercase tracking-wide">
            ★ CRÍTICO
          </span>
        </div>
      )}

      {/* Row 1: Name + SLA timer */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className="text-xs font-semibold text-white leading-tight line-clamp-2 flex-1">
          {deal.arrematante}
        </p>
        <span className={`text-[10px] font-mono whitespace-nowrap ${slaClass}`}>
          {slaDisplay}
        </span>
      </div>

      {/* Row 2: City · UF */}
      <p className="text-[10px] text-gray-500 mb-1.5">
        {deal.city} · {deal.uf}
      </p>

      {/* Row 3: Value + Phase */}
      <div className="flex items-center justify-between gap-1 mb-2">
        <span className="text-[11px] font-bold text-gray-200">{formattedValue}</span>
        <PhaseBadge phase={deal.currentPhase} color={deal.phaseColor} />
      </div>

      {/* Row 4: Channels + Assignee */}
      <div className="flex items-center justify-between gap-1">
        <ChannelBadges channels={deal.channels} />
        {deal.assignee && <AssigneeAvatar {...deal.assignee} />}
      </div>

      <div className="mt-2 flex justify-end">
        <a
          href={`/deals/${deal.id}`}
          onClick={(event) => event.stopPropagation()}
          className="text-[10px] font-medium text-brand-400 hover:text-brand-300"
        >
          Abrir deal
        </a>
      </div>
    </div>
  );
}

/** Versão leve para o DragOverlay */
export function KanbanCardOverlay({ deal }: { deal: KanbanDeal }) {
  return <KanbanCard deal={deal} isOverlay />;
}
