"use client";

/**
 * FlowOS v4 — Go-Live Dashboard
 * /golive  (acesso interno — não exposto ao cliente)
 *
 * Checklist interativo para acompanhar o corte de produção em 31/03/2026.
 * Cada passo tem sub-itens, status e campo de observações.
 */

import { useState, useCallback } from "react";

// ─── Dados do checklist ───────────────────────────────────────────────────────

type Status = "pending" | "running" | "ok" | "failed" | "skipped";

interface SubItem {
  id:     string;
  label:  string;
  cmd?:   string;  // comando de validação
}

interface Step {
  id:      string;
  number:  number;
  title:   string;
  owner:   string;
  items:   SubItem[];
  gate?:   string;  // critério de aprovação
}

const STEPS: Step[] = [
  {
    id: "env", number: 1, title: "Configurar .env produção", owner: "Diego",
    gate: "Nenhuma credencial hardcoded",
    items: [
      { id: "env-db",       label: "DATABASE_URL configurada" },
      { id: "env-supabase", label: "SUPABASE_URL + ANON_KEY configurados" },
      { id: "env-redis",    label: "REDIS_URL configurada" },
      { id: "env-jwt",      label: "PORTAL_JWT_SECRET gerado (openssl rand -hex 32)" },
      { id: "env-whatsapp", label: "WHATSAPP_TOKEN + PHONE_ID configurados" },
      { id: "env-minio",    label: "MINIO_ACCESS_KEY + SECRET_KEY configurados" },
      { id: "env-caixa",    label: "CAIXA_USER + PASS + TOTP_SECRET configurados" },
      { id: "env-scan",     label: 'Nenhum "sk-" ou "password" hardcoded no código', cmd: 'grep -r "sk-" apps/ packages/ --include="*.ts"' },
    ],
  },
  {
    id: "docker", number: 2, title: "docker compose up -d", owner: "Neemias",
    gate: "Todos os containers healthy",
    items: [
      { id: "docker-up",       label: "docker compose up -d executado", cmd: "docker compose up -d" },
      { id: "docker-postgres", label: "postgres healthy", cmd: "docker compose ps postgres" },
      { id: "docker-redis",    label: "redis healthy",    cmd: "docker compose ps redis" },
      { id: "docker-minio",    label: "minio healthy",    cmd: "docker compose ps minio" },
    ],
  },
  {
    id: "dbsetup", number: 3, title: "pnpm db:setup", owner: "Neemias",
    gate: "Trigger audit_immutable ativo + pgvector habilitado",
    items: [
      { id: "db-push",    label: "pnpm db:push (schema aplicado)", cmd: "pnpm db:push" },
      { id: "db-setup",   label: "pnpm db:setup (pgvector + trigger)", cmd: "pnpm db:setup" },
      { id: "db-seed",    label: "pnpm db:seed (workspace + stages + member)", cmd: "pnpm db:seed" },
      { id: "db-trigger", label: 'Trigger "trg_audit_immutable" retorna 1 linha', cmd: `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'trg_audit_immutable';` },
      { id: "db-vector",  label: 'pgvector "vector" retorna 1 linha', cmd: `SELECT extname FROM pg_extension WHERE extname = 'vector';` },
    ],
  },
  {
    id: "migration", number: 4, title: "Migração Pipedrive", owner: "Neemias",
    gate: "36 deals criados, 0 sem contato",
    items: [
      { id: "mig-dryrun",  label: "Dry-run executado sem erros", cmd: "pnpm migrate:pipedrive --input ./exports/pipedrive-deals.csv --org-id <ID>" },
      { id: "mig-summary", label: "migration-summary.json conferido (subtypes + deadlines)" },
      { id: "mig-approve", label: "Diego aprovou o summary" },
      { id: "mig-real",    label: "Execução real --no-dry-run", cmd: "pnpm migrate:pipedrive --input ./exports/pipedrive-deals.csv --org-id <ID> --no-dry-run" },
      { id: "mig-count",   label: "COUNT(*) FROM Deal = 36", cmd: `SELECT COUNT(*) FROM "Deal";` },
      { id: "mig-contact", label: "0 deals sem contactId", cmd: `SELECT COUNT(*) FROM "Deal" WHERE "contactId" IS NULL;` },
    ],
  },
  {
    id: "kanban", number: 5, title: "Validar 36 deals no Kanban", owner: "Diego",
    gate: "Kanban carregado com Q1 visível + drag-and-drop ok",
    items: [
      { id: "kan-dev",   label: "pnpm dev subiu na porta 3000", cmd: "pnpm dev" },
      { id: "kan-open",  label: "localhost:3030/kanban abre sem erro" },
      { id: "kan-q1",    label: "Swimlane Q1 com deals urgentes visível" },
      { id: "kan-cards", label: "Cards: nome + valor + fase + timer SLA" },
      { id: "kan-drag",  label: "Drag-and-drop entre colunas funcionando" },
      { id: "kan-dash",  label: `localhost:3030/dashboard → indicador "LIVE" piscando` },
      { id: "kan-sse",   label: 'SSE retorna 401 sem auth', cmd: "curl -I http://localhost:3030/api/sse/dashboard" },
    ],
  },
  {
    id: "rpa", number: 6, title: "Ativar RPA (CAIXA_DRY_RUN=false)", owner: "Neemias",
    gate: "RpaLog com status=SUCCESS + rowsFound > 0",
    items: [
      { id: "rpa-drytest",  label: "Teste manual dry-run com credenciais reais", cmd: "CAIXA_DRY_RUN=true npx tsx packages/brain/src/workers/rpa-caixa.ts" },
      { id: "rpa-rowsfound",label: "rowsFound > 0 sem erro no output" },
      { id: "rpa-approve",  label: "Diego aprovou ativação do RPA" },
      { id: "rpa-env",      label: "CAIXA_DRY_RUN=false atualizado no .env" },
      { id: "rpa-restart",  label: "docker compose restart brain-worker", cmd: "docker compose restart brain-worker" },
      { id: "rpa-log",      label: "RpaLog status=SUCCESS no banco", cmd: `SELECT status, "rowsFound", "rowsNew" FROM "RpaLog" ORDER BY "createdAt" DESC LIMIT 1;` },
    ],
  },
  {
    id: "portal", number: 7, title: "Testar portal com arrematante real", owner: "Diego",
    gate: "Portal abre no celular + todos os 6 items visuais ok",
    items: [
      { id: "por-link",    label: "Magic link gerado via POST /api/portal/generate-link", cmd: `curl -X POST http://localhost:3030/api/portal/generate-link -H "Content-Type: application/json" -d '{"dealId":"<ID>"}'` },
      { id: "por-auth",    label: "Link abre, autentica e redireciona para /portal/<dealId>" },
      { id: "por-stepper", label: "Stepper mostra fase atual do deal" },
      { id: "por-step",    label: `Card "Próximo passo" em linguagem simples` },
      { id: "por-docs",    label: "Checklist de documentos pendentes" },
      { id: "por-ajuda",   label: "Botão ajuda → WhatsApp do corretor" },
      { id: "por-timeline",label: "Timeline mostra histórico de eventos" },
      { id: "por-offline", label: "DevTools Offline → versão cacheada sem erro" },
      { id: "por-mobile",  label: "Testado no celular real via ngrok", cmd: "npx ngrok http 3000" },
    ],
  },
  {
    id: "cutover", number: 8, title: "Corte ChatGuru + Pipedrive (IRREVERSÍVEL)", owner: "Diego",
    gate: "Todos os 6 pré-requisitos verdes + aprovação explícita de Diego",
    items: [
      { id: "cut-prereqs",  label: "TODOS os passos 1–7 com status ✅" },
      { id: "cut-approve",  label: "Diego autorizou o corte formalmente" },
      { id: "cut-backup",   label: "Backup CSV Pipedrive exportado e guardado" },
      { id: "cut-chatguru", label: "Webhook WhatsApp redirecionado → /api/webhooks/rocket" },
      { id: "cut-automations", label: "Automações ChatGuru desativadas" },
      { id: "cut-pipe-off", label: "Automações Pipedrive desativadas" },
      { id: "cut-team",     label: "Equipe notificada: usar FlowOS Kanban a partir de agora" },
      { id: "cut-monitor",  label: "2h de monitoramento pós-corte concluídas", cmd: "docker compose logs -f brain-worker" },
    ],
  },
];

// ─── Componentes ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<Status, { bg: string; text: string; icon: string }> = {
  pending: { bg: "bg-gray-800",        text: "text-gray-400",   icon: "○" },
  running: { bg: "bg-yellow-900/40",   text: "text-yellow-300", icon: "◎" },
  ok:      { bg: "bg-green-900/40",    text: "text-green-300",  icon: "✓" },
  failed:  { bg: "bg-red-900/40",      text: "text-red-300",    icon: "✗" },
  skipped: { bg: "bg-gray-700/40",     text: "text-gray-500",   icon: "—" },
};

function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  const label = status === "ok" ? "OK" : status === "failed" ? "FALHOU" : status === "running" ? "EM ANDAMENTO" : status === "skipped" ? "PULADO" : "PENDENTE";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold ${s.bg} ${s.text}`}>
      {s.icon} {label}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors ml-2 shrink-0"
    >
      {copied ? "✓ copiado" : "copiar"}
    </button>
  );
}

// ─── State types ──────────────────────────────────────────────────────────────

type ItemStatuses = Record<string, Status>;
type StepStatuses = Record<string, Status>;
type Notes        = Record<string, string>;

// ─── Main component ───────────────────────────────────────────────────────────

export default function GoLivePage() {
  const [itemStatus,  setItemStatus]  = useState<ItemStatuses>({});
  const [stepStatus,  setStepStatus]  = useState<StepStatuses>({});
  const [notes,       setNotes]       = useState<Notes>({});
  const [expandedCmd, setExpandedCmd] = useState<string | null>(null);
  const [activeStep,  setActiveStep]  = useState<string>(STEPS[0]!.id);

  const setItem = useCallback((id: string, status: Status) => {
    setItemStatus(prev => ({ ...prev, [id]: status }));
  }, []);

  const setStep = useCallback((id: string, status: Status) => {
    setStepStatus(prev => ({ ...prev, [id]: status }));
  }, []);

  // Progresso global
  const totalItems = STEPS.flatMap(s => s.items).length;
  const doneItems  = Object.values(itemStatus).filter(s => s === "ok" || s === "skipped").length;
  const pct        = Math.round((doneItems / totalItems) * 100);

  const stepsOk = STEPS.filter(s => stepStatus[s.id] === "ok").length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-4">
        <div>
          <h1 className="text-base font-bold text-white">FlowOS v4 — Go-Live 31/03/2026</h1>
          <p className="text-xs text-gray-400">Arrematador Caixa · Neemias (exec) · Diego (aprovação)</p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{pct}%</div>
            <div className="text-[10px] text-gray-500">{doneItems}/{totalItems} itens</div>
          </div>
          <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${pct === 100 ? "bg-green-500" : pct >= 60 ? "bg-yellow-400" : "bg-indigo-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={`text-xs px-2 py-1 rounded font-bold ${stepsOk === STEPS.length ? "bg-green-900/60 text-green-300" : "bg-gray-800 text-gray-400"}`}>
            {stepsOk}/{STEPS.length} passos ✅
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        {/* ── Sidebar nav ─────────────────────────────────────────────── */}
        <nav className="w-52 shrink-0 bg-gray-900/50 border-r border-gray-800 overflow-y-auto p-3 space-y-1">
          {STEPS.map(step => {
            const st = stepStatus[step.id] ?? "pending";
            const s  = STATUS_STYLE[st];
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors
                  ${activeStep === step.id ? "bg-indigo-900/50 border border-indigo-700" : "hover:bg-gray-800"}
                `}
              >
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${s.text}`}>{s.icon}</span>
                  <span className="text-gray-300">{step.number}. {step.title}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* ── Content area ─────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          {STEPS.filter(s => s.id === activeStep).map(step => (
            <div key={step.id}>
              {/* Step header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs text-gray-500">PASSO {step.number}</span>
                    <StatusBadge status={stepStatus[step.id] ?? "pending"} />
                  </div>
                  <h2 className="text-xl font-bold text-white">{step.title}</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Owner: <span className="text-indigo-300">{step.owner}</span>
                    {step.gate && <> · Gate: <span className="text-green-300">{step.gate}</span></>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {(["running", "ok", "failed", "pending"] as Status[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setStep(step.id, s)}
                      className={`text-[11px] px-2.5 py-1 rounded font-bold transition-colors
                        ${stepStatus[step.id] === s ? `${STATUS_STYLE[s].bg} ${STATUS_STYLE[s].text} ring-1 ring-current` : "bg-gray-800 text-gray-500 hover:bg-gray-700"}
                      `}
                    >
                      {STATUS_STYLE[s].icon} {s === "ok" ? "OK" : s === "failed" ? "FALHOU" : s === "running" ? "RUNNING" : "RESET"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-items */}
              <div className="space-y-2 mb-6">
                {step.items.map(item => {
                  const ist = itemStatus[item.id] ?? "pending";
                  return (
                    <div key={item.id} className={`rounded-lg border px-4 py-3 transition-colors
                      ${ist === "ok"     ? "border-green-800/60 bg-green-950/20"
                      : ist === "failed" ? "border-red-800/60 bg-red-950/20"
                      : ist === "running"? "border-yellow-800/60 bg-yellow-950/20"
                      : "border-gray-800 bg-gray-900/40"}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox visual */}
                        <button
                          onClick={() => setItem(item.id, ist === "ok" ? "pending" : "ok")}
                          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                            ${ist === "ok" ? "bg-green-500 border-green-500 text-white" : "border-gray-600 hover:border-green-500"}`}
                        >
                          {ist === "ok" && <span className="text-[10px] font-bold">✓</span>}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${ist === "ok" ? "line-through text-gray-500" : "text-gray-200"}`}>
                            {item.label}
                          </p>
                          {item.cmd && (
                            <div className="mt-1.5 flex items-start gap-1">
                              <button
                                onClick={() => setExpandedCmd(expandedCmd === item.id ? null : item.id)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 shrink-0"
                              >
                                {expandedCmd === item.id ? "▼ cmd" : "▶ cmd"}
                              </button>
                              {expandedCmd === item.id && (
                                <div className="flex-1 min-w-0">
                                  <code className="block text-[10px] text-yellow-200 bg-gray-950 px-2 py-1 rounded border border-gray-700 break-all whitespace-pre-wrap">
                                    {item.cmd}
                                  </code>
                                  <CopyBtn text={item.cmd} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Status rápido */}
                        <div className="flex gap-1 shrink-0">
                          {(["ok", "failed", "skipped"] as Status[]).map(s => (
                            <button
                              key={s}
                              onClick={() => setItem(item.id, ist === s ? "pending" : s)}
                              title={s}
                              className={`w-6 h-6 rounded text-[11px] font-bold transition-colors
                                ${itemStatus[item.id] === s
                                  ? `${STATUS_STYLE[s].bg} ${STATUS_STYLE[s].text}`
                                  : "bg-gray-800 text-gray-600 hover:bg-gray-700"}`}
                            >
                              {STATUS_STYLE[s].icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Observações / blockers deste passo:</label>
                <textarea
                  value={notes[step.id] ?? ""}
                  onChange={e => setNotes(prev => ({ ...prev, [step.id]: e.target.value }))}
                  rows={3}
                  placeholder="Ex: trigger criado com sucesso às 14:32 · blocker: credencial do TOTP ainda não recebida"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 resize-none focus:outline-none focus:border-indigo-600 placeholder:text-gray-600"
                />
              </div>

              {/* Navigate */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => {
                    const idx = STEPS.findIndex(s => s.id === activeStep);
                    if (idx > 0) setActiveStep(STEPS[idx - 1]!.id);
                  }}
                  disabled={activeStep === STEPS[0]!.id}
                  className="text-xs px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>

                {step.number < 8 ? (
                  <button
                    onClick={() => {
                      const idx = STEPS.findIndex(s => s.id === activeStep);
                      if (idx < STEPS.length - 1) setActiveStep(STEPS[idx + 1]!.id);
                    }}
                    className="text-xs px-4 py-2 rounded bg-indigo-700 hover:bg-indigo-600 transition-colors"
                  >
                    Próximo passo →
                  </button>
                ) : (
                  <button
                    disabled={stepsOk < STEPS.length}
                    className="text-xs px-4 py-2 rounded bg-red-700 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold"
                    onClick={() => alert("✅ Go-live autorizado! Execute o corte agora.")}
                  >
                    🚀 AUTORIZAR CORTE
                  </button>
                )}
              </div>
            </div>
          ))}
        </main>

        {/* ── Summary sidebar ──────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 border-l border-gray-800 bg-gray-900/30 p-4 overflow-y-auto">
          <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">Status dos Passos</h3>
          <div className="space-y-1.5">
            {STEPS.map(step => {
              const st   = stepStatus[step.id] ?? "pending";
              const done = step.items.filter(i => (itemStatus[i.id] ?? "pending") === "ok" || (itemStatus[i.id] ?? "pending") === "skipped").length;
              const s    = STATUS_STYLE[st];
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-[11px] transition-colors
                    ${activeStep === step.id ? "bg-gray-800" : "hover:bg-gray-800/50"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-bold ${s.text}`}>{step.number}. {step.title.slice(0, 20)}{step.title.length > 20 ? "…" : ""}</span>
                    <span className={`font-bold ${s.text}`}>{s.icon}</span>
                  </div>
                  <div className="mt-0.5 w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${st === "ok" ? "bg-green-500" : st === "failed" ? "bg-red-500" : "bg-indigo-500"}`}
                      style={{ width: `${Math.round((done / step.items.length) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">{done}/{step.items.length} itens</div>
                </button>
              );
            })}
          </div>

          {/* Resumo final */}
          <div className="mt-6 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="text-[10px] text-gray-400 mb-2 font-bold uppercase">Resumo</div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-gray-400">Total itens</span><span className="text-white">{totalItems}</span></div>
              <div className="flex justify-between"><span className="text-green-400">Concluídos</span><span className="text-green-300">{doneItems}</span></div>
              <div className="flex justify-between"><span className="text-red-400">Falharam</span><span className="text-red-300">{Object.values(itemStatus).filter(s => s === "failed").length}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Pendentes</span><span className="text-gray-300">{totalItems - doneItems - Object.values(itemStatus).filter(s => s === "failed").length}</span></div>
            </div>
            <div className="mt-3 text-center">
              <div className={`text-lg font-bold ${pct === 100 ? "text-green-400" : "text-indigo-400"}`}>{pct}%</div>
              <div className="text-[9px] text-gray-500">concluído</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
