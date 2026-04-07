import type { Metadata } from "next";

export const metadata: Metadata = { title: "Brain IA" };

const USAGE_DATA = [
  { month: "Out/25", model: "gpt-4o-mini", cost: 218, tokens: 1_453_333, cacheHit: 0 },
  { month: "Nov/25", model: "gpt-4o-mini", cost: 225, tokens: 1_500_000, cacheHit: 5 },
  { month: "Dez/25", model: "gpt-4o-mini", cost: 198, tokens: 1_320_000, cacheHit: 12 },
  { month: "Jan/26", model: "fine-tuned",  cost: 120, tokens: 1_500_000, cacheHit: 28 },
  { month: "Fev/26", model: "fine-tuned",  cost: 96,  tokens: 1_200_000, cacheHit: 45 },
  { month: "Mar/26", model: "local",       cost: 47,  tokens: 4_700_000, cacheHit: 68 },
];

const AGENTS = [
  { name: "Corretor IA", skills: 6, interactions: 342, memoryFragments: 89, budgetUsed: 38, budgetLimit: 50 },
  { name: "Deal Agent", skills: 4, interactions: 156, memoryFragments: 41, budgetUsed: 9, budgetLimit: 30 },
];

const panelClass =
  "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";
const kpiLabelClass = "text-xs font-medium uppercase tracking-wide text-gray-500";

export default function BrainPage() {
  const latest = USAGE_DATA[USAGE_DATA.length - 1]!;
  const first = USAGE_DATA[0]!;
  const savingPct = Math.round(((first.cost - latest.cost) / first.cost) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Brain IA</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cascata de custo · memória → padrão → fine-tune → modelo local
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className={panelClass}>
          <p className={kpiLabelClass}>Custo este mês</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">${latest.cost}</p>
          <p className="text-xs text-gray-500 mt-1">modelo: {latest.model}</p>
        </div>
        <div className={panelClass}>
          <p className={kpiLabelClass}>Economia acumulada</p>
          <p className="text-3xl font-bold text-green-400 mt-1">-{savingPct}%</p>
          <p className="text-xs text-gray-500 mt-1">vs. mês 1</p>
        </div>
        <div className={panelClass}>
          <p className={kpiLabelClass}>Cache hit rate</p>
          <p className="text-3xl font-bold text-brand-400 mt-1">{latest.cacheHit}%</p>
          <p className="text-xs text-gray-500 mt-1">respostas da memória</p>
        </div>
      </div>

      {/* Cost chart (ASCII-style bars) */}
      <div className={panelClass}>
        <h2 className="font-semibold text-white mb-4">Evolução de Custo Mensal</h2>
        <div className="space-y-2">
          {USAGE_DATA.map((d) => {
            const pct = Math.round((d.cost / first.cost) * 100);
            const isLocal = d.model === "local";
            const isFineTuned = d.model === "fine-tuned";
            return (
              <div key={d.month} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 text-right">{d.month}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-5 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isLocal ? "bg-green-500/70" : isFineTuned ? "bg-blue-500/70" : "bg-brand-500/70"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-white w-14">${d.cost}</span>
                <span className={`text-xs w-24 ${isLocal ? "text-green-400" : isFineTuned ? "text-blue-400" : "text-gray-500"}`}>
                  {d.model}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-600 mt-3">
          Meta: &lt;$20/mês com modelo local 100% — estimativa: Abr/26
        </p>
      </div>

      {/* Agents */}
      <div className={panelClass}>
        <h2 className="font-semibold text-white mb-4">Agentes Ativos</h2>
        <div className="space-y-3">
          {AGENTS.map((a) => {
            const budgetPct = Math.round((a.budgetUsed / a.budgetLimit) * 100);
            return (
              <div key={a.name} className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-white">{a.name}</p>
                    <p className="text-xs text-gray-500">{a.skills} skills · {a.memoryFragments} memórias</p>
                  </div>
                  <span className="text-xs text-gray-400">{a.interactions} interações</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-full rounded-full ${budgetPct > 80 ? "bg-red-500" : "bg-brand-500"}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">${a.budgetUsed}/${a.budgetLimit} [SEC-07]</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
