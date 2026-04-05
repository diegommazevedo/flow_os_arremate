"use client";

import type { WorkerStat } from "../_lib/dashboard-queries";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(epochMs: number | null): string {
  if (!epochMs) return "Nunca executado";
  const diff = Date.now() - epochMs;
  const min  = Math.floor(diff / 60_000);
  const h    = Math.floor(diff / 3_600_000);
  const d    = Math.floor(diff / 86_400_000);
  if (min < 1)   return "Agora mesmo";
  if (min < 60)  return `${min} min atrás`;
  if (h   < 24)  return `${h}h atrás`;
  return `${d}d atrás`;
}

const STATUS_STYLES: Record<WorkerStat["status"], { dot: string; label: string; text: string }> = {
  ok:      { dot: "bg-emerald-500",            label: "OK",       text: "text-emerald-400" },
  error:   { dot: "bg-red-500 animate-pulse",  label: "ERRO",     text: "text-red-400"     },
  idle:    { dot: "bg-gray-600",               label: "IDLE",     text: "text-gray-500"    },
  running: { dot: "bg-blue-500 animate-pulse", label: "RODANDO",  text: "text-blue-400"    },
};

// ─── Worker Card ──────────────────────────────────────────────────────────────

function WorkerCard({ worker, icon, stats }: {
  worker: WorkerStat;
  icon:   string;
  stats:  { label: string; value: number | string; highlight?: boolean }[];
}) {
  const s = STATUS_STYLES[worker.status];

  return (
    <div
      className={`rounded-xl border p-4 ${
        worker.status === "error"
          ? "border-red-900/60 bg-red-950/20"
          : "border-gray-800 bg-gray-900"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">{worker.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{relativeTime(worker.lastRunAt)}</p>
          </div>
        </div>

        {/* Status badge */}
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
          <span className={`text-xs font-bold ${s.text}`}>{s.label}</span>
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {stats.map(stat => (
          <div key={stat.label} className="bg-gray-800/50 rounded-lg px-2.5 py-2 text-center">
            <p className={`text-base font-bold tabular-nums ${stat.highlight ? "text-emerald-400" : "text-white"}`}>
              {stat.value}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Detail */}
      <p className="text-xs text-gray-500 truncate">{worker.detail}</p>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface Props {
  rpa:        WorkerStat;
  paymentBot: WorkerStat;
  reportGen:  WorkerStat;
}

export function WorkerStatus({ rpa, paymentBot, reportGen }: Props) {
  const anyError = [rpa, paymentBot, reportGen].some(w => w.status === "error");

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          <h2 className="font-semibold text-white">Workers e Automações</h2>
        </div>
        {anyError && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-900/50 text-red-300 border border-red-800 animate-pulse">
            Atenção necessária
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <WorkerCard
          worker={rpa}
          icon="🤖"
          stats={[
            { label: "Encontrados",    value: rpa.rowsFound           },
            { label: "Novos",          value: rpa.rowsNew, highlight: rpa.rowsNew > 0 },
            { label: "Falhas",         value: rpa.failuresToday       },
          ]}
        />

        <WorkerCard
          worker={paymentBot}
          icon="💳"
          stats={[
            { label: "Jobs Pendentes", value: paymentBot.jobsPending  },
            { label: "Alertas Hoje",   value: paymentBot.sentToday, highlight: paymentBot.sentToday > 0 },
            { label: "Falhas",         value: paymentBot.failuresToday },
          ]}
        />

        <WorkerCard
          worker={reportGen}
          icon="📄"
          stats={[
            { label: "PDFs Gerados",   value: reportGen.docsToday, highlight: reportGen.docsToday > 0 },
            { label: "Pendentes",      value: reportGen.jobsPending },
            { label: "Falhas",         value: reportGen.failuresToday },
          ]}
        />
      </div>
    </div>
  );
}
