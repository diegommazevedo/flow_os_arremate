/**
 * PhaseStepper — Stepper horizontal de fases do processo.
 *
 * UX 45–50 anos:
 *   - Ícones grandes (40px) para facilitar identificação
 *   - Labels em linguagem simples (sem siglas técnicas)
 *   - Scroll horizontal no mobile com indicador de progresso
 *   - Cores claras: cinza=pendente, azul=ativo, verde=concluído
 */

import type { PortalPhase } from "../_lib/portal-queries";

interface Props {
  phases:       PortalPhase[];
  currentPhase: PortalPhase | null;
  imovelLabel:  string;
  etapaLabel:   string;
}

export function PhaseStepper({ phases, currentPhase, imovelLabel, etapaLabel }: Props) {
  // Exibir apenas as fases principais (não paralelas) no stepper visual
  const mainPhases    = phases.filter(p => !p.parallel);
  const parallelPhases = phases.filter(p => p.parallel);

  const completedCount = mainPhases.filter(p => p.status === "done").length;
  const totalCount     = mainPhases.length;
  const progressPct    = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

      {/* Cabeçalho do card de progresso */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-gray-500">Seu imóvel</p>
            <p className="text-base font-bold text-gray-900 leading-tight">{imovelLabel}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="inline-flex items-center bg-blue-50 text-blue-700 text-sm font-semibold px-2.5 py-1 rounded-xl border border-blue-200">
              {etapaLabel}
            </span>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 font-medium">Progresso geral</span>
            <span className="text-xs font-bold text-gray-700">{progressPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {completedCount} de {totalCount} etapas concluídas
          </p>
        </div>
      </div>

      {/* Stepper horizontal com scroll */}
      <div className="relative">
        <div
          className="flex gap-0 overflow-x-auto scrollbar-hide py-4 px-2"
          role="list"
          aria-label="Etapas do processo"
        >
          {mainPhases.map((phase, i) => (
            <PhaseStep
              key={phase.id}
              phase={phase}
              isLast={i === mainPhases.length - 1}
              isCurrent={phase.id === currentPhase?.id}
            />
          ))}
        </div>
        {/* Fade nas extremidades para indicar scroll */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      </div>

      {/* Branches paralelas (se existirem) */}
      {parallelPhases.length > 0 && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Em andamento simultâneo
          </p>
          <div className="flex flex-wrap gap-2">
            {parallelPhases.map(phase => (
              <ParallelBadge key={phase.id} phase={phase} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step individual ──────────────────────────────────────────────────────────

function PhaseStep({
  phase,
  isLast,
  isCurrent,
}: {
  phase:     PortalPhase;
  isLast:    boolean;
  isCurrent: boolean;
}) {
  const isDone    = phase.status === "done";
  const isPending = phase.status === "pending";

  return (
    <div
      className="flex items-center flex-shrink-0"
      role="listitem"
      aria-current={isCurrent ? "step" : undefined}
    >
      {/* Nó da etapa */}
      <div className="flex flex-col items-center w-[72px]">
        {/* Ícone / check */}
        <div
          className={[
            "w-11 h-11 rounded-2xl flex items-center justify-center text-xl transition-all",
            isDone    ? "bg-green-500 shadow-green-200 shadow-md"
              : isCurrent ? "bg-blue-600 shadow-blue-200 shadow-md ring-4 ring-blue-100"
              : "bg-gray-100",
          ].join(" ")}
          aria-hidden
        >
          {isDone ? "✅" : phase.icon}
        </div>

        {/* Label curto */}
        <span
          className={[
            "text-center text-[11px] font-semibold mt-1.5 leading-tight w-full",
            isDone    ? "text-green-700"
              : isCurrent ? "text-blue-700"
              : isPending ? "text-gray-400"
              : "text-gray-600",
          ].join(" ")}
        >
          {phase.humanLabel.split(" ").slice(0, 2).join(" ")}
        </span>

        {/* Status badge */}
        <span
          className={[
            "text-[10px] mt-0.5 font-medium",
            isDone    ? "text-green-500"
              : isCurrent ? "text-blue-500"
              : "text-gray-300",
          ].join(" ")}
          aria-label={`Status: ${isDone ? "concluído" : isCurrent ? "em andamento" : "pendente"}`}
        >
          {isDone ? "✓ Pronto" : isCurrent ? "● Agora" : "○"}
        </span>
      </div>

      {/* Linha de conexão */}
      {!isLast && (
        <div
          className={[
            "h-0.5 w-3 flex-shrink-0 mx-0.5 mt-[-20px]",
            isDone ? "bg-green-400" : "bg-gray-200",
          ].join(" ")}
          aria-hidden
        />
      )}
    </div>
  );
}

// ─── Badge de branch paralela ─────────────────────────────────────────────────

function ParallelBadge({ phase }: { phase: PortalPhase }) {
  const isDone   = phase.status === "done";
  const isActive = phase.status === "active";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border",
        isDone   ? "bg-green-50 text-green-700 border-green-200"
          : isActive ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-gray-50 text-gray-500 border-gray-200",
      ].join(" ")}
    >
      <span aria-hidden>{phase.icon}</span>
      {phase.humanLabel}
      {isDone && <span aria-hidden>✓</span>}
    </span>
  );
}
