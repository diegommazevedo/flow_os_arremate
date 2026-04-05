import type { Metadata } from "next";

export const metadata: Metadata = { title: "Configurações" };

const SECURITY_INVARIANTS = [
  { code: "SEC-01", name: "Isolamento de Tenant", status: "ok" },
  { code: "SEC-02", name: "Autenticação em Todo Endpoint", status: "ok" },
  { code: "SEC-03", name: "Autorização por Role", status: "ok" },
  { code: "SEC-04", name: "Vars de Ambiente Seguras", status: "ok" },
  { code: "SEC-05", name: "Validação Zod", status: "ok" },
  { code: "SEC-06", name: "Audit Log Imutável", status: "ok" },
  { code: "SEC-07", name: "Budget Limit de IA", status: "ok" },
  { code: "SEC-08", name: "Sanitização de Prompt", status: "ok" },
  { code: "SEC-09", name: "HTTPS em Produção", status: "ok" },
  { code: "SEC-10", name: "Rate Limiting", status: "ok" },
  { code: "SEC-11", name: "PII Fora dos Logs", status: "ok" },
  { code: "SEC-12", name: "Rotação de Secrets (90d)", status: "warn" },
] as const;

export default function SettingsPage() {
  const allOk = SECURITY_INVARIANTS.filter((i) => i.status === "ok").length;
  const warns = SECURITY_INVARIANTS.filter((i) => i.status === "warn").length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Workspace · Segurança · Templates</p>
      </div>

      {/* Workspace info */}
      <div className="card">
        <h2 className="font-semibold text-white mb-4">Workspace</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="label mb-1">Nome</p>
            <p className="text-white">Imobiliária Demo Caixa</p>
          </div>
          <div>
            <p className="label mb-1">Slug</p>
            <code className="text-brand-400 text-xs bg-gray-800 px-2 py-1 rounded">demo-imobiliaria</code>
          </div>
          <div>
            <p className="label mb-1">Template ativo</p>
            <p className="text-white">Imobiliária Caixa</p>
          </div>
          <div>
            <p className="label mb-1">Plano</p>
            <p className="text-white">Pro</p>
          </div>
        </div>
      </div>

      {/* Security dashboard */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Fortaleza — 12 Invariantes de Segurança</h2>
          <div className="flex gap-2">
            <span className="badge bg-green-900/30 text-green-400 border border-green-800">
              {allOk} OK
            </span>
            {warns > 0 && (
              <span className="badge bg-amber-900/30 text-amber-400 border border-amber-800">
                {warns} atenção
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SECURITY_INVARIANTS.map((inv) => (
            <div
              key={inv.code}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                inv.status === "ok"
                  ? "bg-green-950/20 border border-green-900/50"
                  : "bg-amber-950/20 border border-amber-900/50"
              }`}
            >
              <span className={inv.status === "ok" ? "text-green-400" : "text-amber-400"}>
                {inv.status === "ok" ? "✓" : "⚠"}
              </span>
              <div>
                <span className="text-xs font-mono text-gray-500">{inv.code}</span>
                <span className="text-xs text-gray-300 ml-2">{inv.name}</span>
              </div>
            </div>
          ))}
        </div>
        {warns > 0 && (
          <p className="text-xs text-amber-400 mt-3">
            ⚠ SEC-12: Secrets não rotacionados nos últimos 90 dias. Rotacione antes de 07/04/2026.
          </p>
        )}
      </div>

      {/* Template */}
      <div className="card">
        <h2 className="font-semibold text-white mb-4">Template Engine</h2>
        <div className="space-y-2">
          {["real-estate", "clinic", "law-firm", "construction", "hospitality"].map((t) => (
            <div
              key={t}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                t === "real-estate"
                  ? "bg-brand-950 border border-brand-800"
                  : "bg-gray-800/50 border border-gray-800"
              }`}
            >
              <code className="text-sm text-gray-300">{t}</code>
              {t === "real-estate" && (
                <span className="badge bg-brand-800 text-brand-300 border-brand-700">ativo</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-3">
          Trocar de template não requer migration — apenas novo ZodSchema para Deal.meta
        </p>
      </div>
    </div>
  );
}
