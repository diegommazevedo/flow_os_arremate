import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fluxos" };

const MOCK_FLOWS = [
  {
    id: "1",
    name: "Auto-simulação Caixa",
    trigger: "deal.stage → Simulação Caixa",
    steps: 1,
    executions: 47,
    lastRun: "há 2h",
    status: "active",
  },
  {
    id: "2",
    name: "Checklist de Documentação",
    trigger: "deal.stage → Documentação",
    steps: 1,
    executions: 31,
    lastRun: "há 5h",
    status: "active",
  },
  {
    id: "3",
    name: "Alerta SLA Aprovação",
    trigger: "cron · seg–sex 09:00",
    steps: 2,
    executions: 120,
    lastRun: "há 3h",
    status: "active",
  },
  {
    id: "4",
    name: "Relatório Semanal do Pipeline",
    trigger: "cron · seg 08:00",
    steps: 2,
    executions: 12,
    lastRun: "há 3 dias",
    status: "active",
  },
];

export default function FlowsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fluxos</h1>
          <p className="text-sm text-gray-500 mt-1">Automações · {MOCK_FLOWS.length} ativos</p>
        </div>
        <button className="btn-primary text-sm">+ Novo Fluxo</button>
      </div>

      <div className="space-y-3">
        {MOCK_FLOWS.map((flow) => (
          <div key={flow.id} className="card flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">{flow.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{flow.trigger}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-right">
              <div>
                <p className="text-xs text-gray-500">Etapas</p>
                <p className="text-sm font-medium text-white">{flow.steps}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Execuções</p>
                <p className="text-sm font-medium text-white">{flow.executions}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Última execução</p>
                <p className="text-sm text-gray-400">{flow.lastRun}</p>
              </div>
              <button className="btn-secondary text-xs py-1 px-2">Editar</button>
            </div>
          </div>
        ))}
      </div>

      {/* Note sobre o motor */}
      <div className="card border-brand-900 bg-brand-950/30">
        <p className="text-sm text-gray-400">
          <span className="text-brand-400 font-semibold">Motor de Fluxos:</span>{" "}
          Todas as automações são armazenadas como dados e executadas pelo{" "}
          <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">FlowEngine</code>.
          Rollback instantâneo · Execução auditada linha a linha · Nenhuma automação em código hardcoded.
        </p>
      </div>
    </div>
  );
}
