import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };

const STAGE_METRICS = [
  { stage: "Captação",        avg: 2.1, conversion: 74, deals: 12, velocity: 2.8 },
  { stage: "Qualificação",    avg: 4.3, conversion: 65, deals: 9,  velocity: 2.1 },
  { stage: "Simulação Caixa", avg: 5.2, conversion: 80, deals: 7,  velocity: 1.6 },
  { stage: "Documentação",    avg: 12.4, conversion: 72, deals: 8, velocity: 1.4 },
  { stage: "Aprovação",       avg: 18.7, conversion: 90, deals: 6, velocity: 1.1 },
  { stage: "Contrato",        avg: 3.2, conversion: 98, deals: 3,  velocity: 0.7 },
];

const panelClass =
  "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";
const kpiLabelClass = "text-xs font-medium uppercase tracking-wide text-gray-500";

export default function AnalyticsPage() {
  const avgConversion = Math.round(
    STAGE_METRICS.reduce((s, m) => s + m.conversion, 0) / STAGE_METRICS.length,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Velocidade · Conversão · SLA · Últimos 30 dias</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className={panelClass}>
          <p className={kpiLabelClass}>Conversão Média</p>
          <p className="text-3xl font-bold text-green-400 mt-1">{avgConversion}%</p>
        </div>
        <div className={panelClass}>
          <p className={kpiLabelClass}>Ciclo de Venda Médio</p>
          <p className="text-3xl font-bold text-white mt-1">46 dias</p>
        </div>
        <div className={panelClass}>
          <p className={kpiLabelClass}>Ticket Médio</p>
          <p className="text-3xl font-bold text-brand-400 mt-1">R$ 780k</p>
        </div>
      </div>

      <div className={panelClass}>
        <h2 className="font-semibold text-white mb-4">Métricas por Stage</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 text-gray-500 font-medium">Stage</th>
                <th className="text-right py-2 text-gray-500 font-medium">Dias médios</th>
                <th className="text-right py-2 text-gray-500 font-medium">Conversão</th>
                <th className="text-right py-2 text-gray-500 font-medium">Deals</th>
                <th className="text-right py-2 text-gray-500 font-medium">Velocidade/sem</th>
              </tr>
            </thead>
            <tbody>
              {STAGE_METRICS.map((m) => (
                <tr key={m.stage} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 text-white">{m.stage}</td>
                  <td className="py-3 text-right text-gray-300">{m.avg}d</td>
                  <td className="py-3 text-right">
                    <span className={m.conversion >= 80 ? "text-green-400" : "text-amber-400"}>
                      {m.conversion}%
                    </span>
                  </td>
                  <td className="py-3 text-right text-gray-300">{m.deals}</td>
                  <td className="py-3 text-right text-brand-400">{m.velocity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
