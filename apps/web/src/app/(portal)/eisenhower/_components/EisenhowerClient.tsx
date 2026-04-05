"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DealCardData, EisenhowerQuadrant } from "../_lib/eisenhower-queries";

// ── Quadrant config ────────────────────────────────────────────────────────────

const QUADRANT_CONFIG = [
  {
    id: "Q1_DO"        as EisenhowerQuadrant,
    label:  "Fazer Agora",
    axis:   "Urgente · Importante",
    wipLimit: 3,
    bg:          "bg-red-950/30",
    border:      "border-red-900/50",
    headerBg:    "bg-red-950/50",
    headerText:  "text-red-300",
    wipBorder:   "border-red-500",
  },
  {
    id: "Q3_DELEGATE"  as EisenhowerQuadrant,
    label:  "Delegar",
    axis:   "Urgente · Não Importante",
    wipLimit: 10,
    bg:          "bg-amber-950/20",
    border:      "border-amber-900/40",
    headerBg:    "bg-amber-950/40",
    headerText:  "text-amber-300",
    wipBorder:   "border-amber-500",
  },
  {
    id: "Q2_PLAN"      as EisenhowerQuadrant,
    label:  "Planejar",
    axis:   "Não Urgente · Importante",
    wipLimit: 8,
    bg:          "bg-blue-950/20",
    border:      "border-blue-900/40",
    headerBg:    "bg-blue-950/40",
    headerText:  "text-blue-300",
    wipBorder:   "border-blue-500",
  },
  {
    id: "Q4_ELIMINATE" as EisenhowerQuadrant,
    label:  "Eliminar",
    axis:   "Não Urgente · Não Importante",
    wipLimit: Infinity,
    bg:          "bg-gray-950",
    border:      "border-gray-800",
    headerBg:    "bg-gray-900",
    headerText:  "text-gray-400",
    wipBorder:   "",
  },
] as const;

const QUADRANT_LABELS: Record<EisenhowerQuadrant, string> = {
  Q1_DO:        "Q1 — Fazer Agora",
  Q2_PLAN:      "Q2 — Planejar",
  Q3_DELEGATE:  "Q3 — Delegar",
  Q4_ELIMINATE: "Q4 — Eliminar",
};

// ── SLA countdown hook (safe for SSR hydration) ───────────────────────────────

function useSlaCountdown(deadline: string | null) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!deadline) {
      setLabel(null);
      return;
    }
    const calc = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) return "VENCIDO";
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };
    setLabel(calc());
    const id = setInterval(() => setLabel(calc()), 60_000);
    return () => clearInterval(id);
  }, [deadline]);

  const isCritical =
    label === "VENCIDO" ||
    (label !== null &&
      deadline !== null &&
      new Date(deadline).getTime() - Date.now() < 2 * 3_600_000);

  return { label, isCritical };
}

// ── Deal card (draggable) ─────────────────────────────────────────────────────

function DealCard({
  deal,
  onClick,
}: {
  deal: DealCardData;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  const { label: slaLabel, isCritical } = useSlaCountdown(deal.paymentDeadline);

  const chb = deal.title.split(" - ")[0] ?? deal.id.slice(-8);
  const displayName = deal.contactName ?? (deal.title.split(" - ")[1] ?? deal.title);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={[
        "cursor-grab select-none rounded-xl border border-gray-800 bg-gray-900 p-3 text-xs",
        "transition-shadow hover:border-gray-700 hover:shadow-md",
        isDragging ? "opacity-40 ring-2 ring-brand-500" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-mono text-[10px] text-gray-500 truncate">{chb}</span>
        {slaLabel && (
          <span
            className={[
              "font-mono text-[10px] font-bold tabular-nums flex-shrink-0",
              isCritical ? "text-red-400" : "text-amber-400",
            ].join(" ")}
          >
            {slaLabel}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-white leading-snug line-clamp-2">{displayName}</p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {deal.phase && (
          <span className="rounded px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px]">
            {deal.phase}
          </span>
        )}
        {deal.uf && (
          <span className="rounded px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px]">
            {deal.uf}
          </span>
        )}
        {deal.value > 0 && (
          <span className="ml-auto text-[10px] text-gray-500 flex-shrink-0">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(deal.value)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Ghost card (shown in DragOverlay) ─────────────────────────────────────────

function GhostCard({ deal }: { deal: DealCardData }) {
  return (
    <div className="rotate-2 w-56 rounded-xl border border-brand-500 bg-gray-900 p-3 text-xs shadow-2xl opacity-95 pointer-events-none">
      <div className="font-mono text-[10px] text-gray-400 mb-1">
        {deal.title.split(" - ")[0] ?? deal.id.slice(-8)}
      </div>
      <p className="text-sm font-medium text-white">{deal.contactName ?? deal.title}</p>
    </div>
  );
}

// ── Quadrant panel (droppable) ────────────────────────────────────────────────

type QuadrantCfg = (typeof QUADRANT_CONFIG)[number];

function QuadrantPanel({
  config,
  deals,
  onDealClick,
}: {
  config: QuadrantCfg;
  deals: DealCardData[];
  onDealClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: config.id });

  const now = Date.now();
  const criticalCount = deals.filter(
    (d) => d.paymentDeadline && new Date(d.paymentDeadline).getTime() - now < 2 * 3_600_000,
  ).length;
  const atWip = config.wipLimit !== Infinity && deals.length >= config.wipLimit;

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col rounded-2xl border overflow-hidden transition-colors",
        atWip ? `${config.wipBorder} animate-pulse` : config.border,
        isOver ? "ring-2 ring-brand-500/60" : "",
        config.bg,
      ].join(" ")}
    >
      {/* Header */}
      <div
        className={[
          "flex items-center justify-between gap-2 px-4 py-3 border-b flex-shrink-0",
          config.border,
          config.headerBg,
        ].join(" ")}
      >
        <div>
          <div className={`text-sm font-bold ${config.headerText}`}>{config.label}</div>
          <div className="text-[10px] text-gray-500">{config.axis}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {criticalCount} crítico{criticalCount > 1 ? "s" : ""}
            </span>
          )}
          <span className={`text-sm font-bold ${config.headerText}`}>
            {deals.length}
            {config.wipLimit !== Infinity ? `/${config.wipLimit}` : ""}
          </span>
          {atWip && (
            <span className="rounded bg-red-900/60 px-1.5 py-0.5 text-[10px] text-red-300 font-bold">
              WIP MAX
            </span>
          )}
        </div>
      </div>

      {/* Deal list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[100px]">
        {deals.length === 0 ? (
          <div className="flex h-16 items-center justify-center text-xs text-gray-600 select-none rounded-xl border-2 border-dashed border-gray-800">
            Arraste deals aqui
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onClick={() => onDealClick(deal.id)} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────

function SidePanel({
  deal,
  onClose,
  onMoveTo,
}: {
  deal: DealCardData;
  onClose: () => void;
  onMoveTo: (q: EisenhowerQuadrant) => void;
}) {
  const fmt = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-gray-800 bg-gray-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 flex-shrink-0">
        <h3 className="text-sm font-semibold text-white">Deal</h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <span className="font-mono text-[10px] text-gray-500">{deal.title.split(" - ")[0] ?? "—"}</span>
          <p className="mt-1 text-base font-semibold text-white leading-snug">
            {deal.contactName ?? deal.title}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "Fase",         value: deal.phase || "—" },
            { label: "Valor",        value: deal.value > 0 ? fmt.format(deal.value) : "—" },
            { label: "UF",           value: deal.uf || "—" },
            { label: "Responsável",  value: deal.ownerId ? deal.ownerId.slice(0, 8) + "…" : "—" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
              <div className="text-gray-500 mb-1">{item.label}</div>
              <div className="font-medium text-white truncate">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <div className="text-[10px] text-gray-500 mb-1">Quadrante atual</div>
          <div className="text-sm font-semibold text-white">{QUADRANT_LABELS[deal.quadrant]}</div>
        </div>

        <div>
          <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Mover para</div>
          <div className="grid grid-cols-2 gap-2">
            {(["Q1_DO", "Q2_PLAN", "Q3_DELEGATE", "Q4_ELIMINATE"] as EisenhowerQuadrant[])
              .filter((q) => q !== deal.quadrant)
              .map((q) => (
                <button
                  key={q}
                  onClick={() => onMoveTo(q)}
                  className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-left"
                >
                  {QUADRANT_LABELS[q]}
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800 p-4 flex-shrink-0">
        <Link
          href={`/deals/${deal.id}`}
          className="block w-full rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-400 transition-colors"
        >
          Ver deal completo →
        </Link>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ReclassResult {
  reclassificados: number;
  distribuicao: Record<string, number>;
  deals?: DealCardData[];
}

export function EisenhowerClient({
  initialDeals,
}: {
  initialDeals: DealCardData[];
  workspaceId: string;
}) {
  const [deals, setDeals] = useState<DealCardData[]>(initialDeals);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterUF, setFilterUF]             = useState("");
  const [reclassifying, setReclassifying]   = useState(false);
  const [reclassResult, setReclassResult]   = useState<ReclassResult | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // SSE — atualiza deals em tempo real
  useEffect(() => {
    const es = new EventSource("/api/sse/kanban");
    es.onmessage = () => {
      fetch("/api/eisenhower/deals")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { deals?: DealCardData[] } | null) => {
          if (data?.deals) setDeals(data.deals);
        })
        .catch(() => null);
    };
    return () => es.close();
  }, []);

  const filtered = deals.filter((d) => {
    if (filterAssignee && d.ownerId !== filterAssignee) return false;
    if (filterUF && d.uf !== filterUF) return false;
    return true;
  });

  const byQ = (q: EisenhowerQuadrant) => filtered.filter((d) => d.quadrant === q);

  const assignees = [...new Set(deals.map((d) => d.ownerId).filter(Boolean))] as string[];
  const ufs       = [...new Set(deals.map((d) => d.uf).filter(Boolean))].sort() as string[];

  const selectedDeal = selectedId ? (deals.find((d) => d.id === selectedId) ?? null) : null;
  const activeDeal   = activeId   ? (deals.find((d) => d.id === activeId)   ?? null) : null;

  const moveDeal = useCallback(async (dealId: string, quadrant: EisenhowerQuadrant) => {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, quadrant } : d)));
    setSelectedId(null);
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: { eisenhower: quadrant } }),
    }).catch(() => null);
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      if (!over) return;
      const newQ     = over.id as EisenhowerQuadrant;
      const dealId   = active.id as string;
      const currentQ = deals.find((d) => d.id === dealId)?.quadrant;
      if (currentQ !== newQ) void moveDeal(dealId, newQ);
    },
    [deals, moveDeal],
  );

  const reclassify = async () => {
    setReclassifying(true);
    setReclassResult(null);
    try {
      const r = await fetch("/api/eisenhower/reclassificar", { method: "POST" });
      const data = (await r.json()) as ReclassResult;
      if (data.deals) setDeals(data.deals);
      setReclassResult(data);
    } catch {
      // noop
    } finally {
      setReclassifying(false);
    }
  };

  const q1Count = byQ("Q1_DO").length;

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] flex-col bg-gray-950">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 px-4 py-3 flex-shrink-0">
        <div>
          <span className="text-sm font-bold text-white">Matriz Eisenhower</span>
          {q1Count > 0 && (
            <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {q1Count} Q1
            </span>
          )}
        </div>
        <div className="flex-1" />

        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200"
        >
          <option value="">Todos os responsáveis</option>
          {assignees.map((a) => (
            <option key={a} value={a}>{a.slice(0, 16)}</option>
          ))}
        </select>

        <select
          value={filterUF}
          onChange={(e) => setFilterUF(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200"
        >
          <option value="">Todos UF</option>
          {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        {reclassResult && (
          <span className="text-xs text-green-400">
            ✓ {reclassResult.reclassificados} reclassificados
          </span>
        )}

        <button
          onClick={() => void reclassify()}
          disabled={reclassifying}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {reclassifying ? "Reclassificando…" : "↺ Reclassificar automático"}
        </button>
      </div>

      {/* ── Axis labels + matrix ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Y-axis label */}
        <div className="hidden md:flex w-8 flex-shrink-0 flex-col items-center justify-center">
          <span className="text-[10px] text-gray-600 rotate-[-90deg] whitespace-nowrap tracking-widest uppercase">
            Urgência →
          </span>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* X-axis label */}
          <div className="hidden md:flex justify-center py-1 flex-shrink-0">
            <span className="text-[10px] text-gray-600 tracking-widest uppercase">
              ← Importância →
            </span>
          </div>

          {/* 2×2 grid */}
          <DndContext
            sensors={sensors}
            onDragStart={({ active }) => setActiveId(active.id as string)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-4 overflow-auto">
              {QUADRANT_CONFIG.map((q) => (
                <QuadrantPanel
                  key={q.id}
                  config={q}
                  deals={byQ(q.id)}
                  onDealClick={setSelectedId}
                />
              ))}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeDeal ? <GhostCard deal={activeDeal} /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* ── Side panel ───────────────────────────────────────────────────── */}
      {selectedDeal && (
        <SidePanel
          deal={selectedDeal}
          onClose={() => setSelectedId(null)}
          onMoveTo={(q) => void moveDeal(selectedDeal.id, q)}
        />
      )}
    </div>
  );
}
