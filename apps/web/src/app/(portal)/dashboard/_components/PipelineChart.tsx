"use client";

import { useRouter } from "next/navigation";
import type { PhaseStat } from "../_lib/dashboard-queries";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEALTH_STYLES: Record<PhaseStat["health"], {
  bar: string; badge: string; dot: string;
}> = {
  green: {
    bar:   "bg-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-400 border-emerald-800",
    dot:   "bg-emerald-500",
  },
  amber: {
    bar:   "bg-amber-500",
    badge: "bg-amber-900/40 text-amber-400 border-amber-800",
    dot:   "bg-amber-500",
  },
  red: {
    bar:   "bg-red-500",
    badge: "bg-red-900/40 text-red-400 border-red-800",
    dot:   "bg-red-500 animate-pulse",
  },
};

const HEALTH_LABELS: Record<PhaseStat["health"], string> = {
  green: "No prazo",
  amber: "Próximo do SLA",
  red:   "SLA excedido",
};

const PANEL =
  "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  phases:     PhaseStat[];
  totalDeals: number;
}

export function PipelineChart({ phases, totalDeals }: Props) {
  const router  = useRouter();
  const maxCount = Math.max(...phases.map(p => p.count), 1);

  if (phases.length === 0) {
    return (
      <div className={PANEL}>
        <h2 className="font-semibold text-white mb-4">📊 Pipeline por Fase</h2>
        <p className="text-sm text-gray-500">Nenhuma fase encontrada.</p>
      </div>
    );
  }

  return (
    <div className={PANEL}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h2 className="font-semibold text-white">Pipeline por Fase</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <LegendDot health="green" />
          <LegendDot health="amber" />
          <LegendDot health="red"   />
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        {phases.map(phase => {
          const pct    = totalDeals > 0 ? (phase.count / maxCount) * 100 : 0;
          const styles = HEALTH_STYLES[phase.health];

          return (
            <button
              key={phase.stageId}
              type="button"
              onClick={() => router.push(`/kanban?phase=${encodeURIComponent(phase.phase)}`)}
              className="w-full text-left group cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
              aria-label={`Filtrar Kanban por fase ${phase.phase}`}
            >
              <div className="flex items-center gap-3">
                {/* Phase name */}
                <span className="text-xs text-gray-400 w-36 flex-shrink-0 truncate group-hover:text-white transition-colors">
                  {phase.phase}
                </span>

                {/* Bar container */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>

                  {/* Count */}
                  <span className="text-sm font-semibold text-white w-6 text-right tabular-nums">
                    {phase.count}
                  </span>
                </div>

                {/* Health badge */}
                <div className="hidden sm:flex items-center gap-2 w-40 flex-shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${styles.badge}`}
                  >
                    {HEALTH_LABELS[phase.health]}
                  </span>
                  {phase.breachCount > 0 && (
                    <span className="text-[10px] text-red-400 font-medium">
                      {phase.breachCount} breach
                    </span>
                  )}
                </div>
              </div>

              {/* SLA info */}
              {phase.slaDays != null && (
                <div className="ml-36 mt-0.5 hidden sm:block">
                  <span className="text-[10px] text-gray-600">
                    SLA: {phase.slaDays}d · Mais antigo: {phase.maxAgeDays}d
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-600 mt-4">
        Clique em uma fase para filtrar o Kanban →
      </p>
    </div>
  );
}

function LegendDot({ health }: { health: PhaseStat["health"] }) {
  const styles = HEALTH_STYLES[health];
  return (
    <span className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
      <span>{HEALTH_LABELS[health]}</span>
    </span>
  );
}
