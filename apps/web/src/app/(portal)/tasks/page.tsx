"use client";

import { useState, useTransition, useEffect } from "react";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Task {
  id:        string;
  title:     string;
  quadrant:  Quadrant;
  dealId?:   string | null;
  dueAt?:    string | null;
  assignee?: string | null;
  deal?:     string | null;
}

interface Deal { id: string; title: string; }

const Q_CONFIG = {
  Q1_DO:        { label: "Q1 — Fazer Agora", color: "text-red-400",   border: "border-red-900",   bg: "bg-red-950/20" },
  Q2_PLAN:      { label: "Q2 — Planejar",    color: "text-blue-400",  border: "border-blue-900",  bg: "bg-blue-950/20" },
  Q3_DELEGATE:  { label: "Q3 — Delegar",     color: "text-amber-400", border: "border-amber-900", bg: "bg-amber-950/20" },
  Q4_ELIMINATE: { label: "Q4 — Eliminar",    color: "text-gray-500",  border: "border-gray-800",  bg: "bg-gray-900" },
} as const;

type Quadrant = keyof typeof Q_CONFIG;

// ─── Dados iniciais ───────────────────────────────────────────────────────────

const SEED: Task[] = [
  { id: "1", title: "Enviar documentação para processo",  quadrant: "Q1_DO",        deal: "Apto Moema",          dueAt: "Hoje",    assignee: "Ana" },
  { id: "2", title: "Revisar proposta — Casa Alphaville", quadrant: "Q1_DO",        deal: "Casa Alphaville",     dueAt: "Amanhã",  assignee: "Pedro" },
  { id: "3", title: "Estratégia de captação Q2 2026",     quadrant: "Q2_PLAN",      deal: null,                  dueAt: "15/04",   assignee: "Você" },
  { id: "4", title: "Planilha de leads do feirão",        quadrant: "Q2_PLAN",      deal: null,                  dueAt: "30/04",   assignee: "Você" },
  { id: "5", title: "Responder mensagem do cliente",      quadrant: "Q3_DELEGATE",  deal: "Studio Vila Madalena",dueAt: "Hoje",    assignee: "Pedro" },
  { id: "6", title: "Atualizar fotos do imóvel",          quadrant: "Q4_ELIMINATE", deal: null,                  dueAt: null,      assignee: "Ana" },
];

// ─── Modal ───────────────────────────────────────────────────────────────────

function NewTaskModal({
  deals,
  onClose,
  onCreated,
}: {
  deals:     Deal[];
  onClose:   () => void;
  onCreated: (t: Task) => void;
}) {
  const [title,    setTitle]    = useState("");
  const [quadrant, setQuadrant] = useState<Quadrant>("Q2_PLAN");
  const [dealId,   setDealId]   = useState("");
  const [error,    setError]    = useState("");
  const [pending,  start]       = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Título é obrigatório."); return; }
    setError("");

    start(async () => {
      const res = await fetch("/api/tasks/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title: title.trim(), quadrant, dealId: dealId || null }),
      });

      if (res.ok) {
        const { task } = await res.json() as { task: Task };
        onCreated(task);
        onClose();
      } else {
        const { error: msg } = await res.json().catch(() => ({ error: "Erro ao criar tarefa." })) as { error: string };
        setError(msg);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-white font-semibold">Nova Tarefa</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Título *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Quadrante Eisenhower</label>
            <select
              value={quadrant}
              onChange={(e) => setQuadrant(e.target.value as Quadrant)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              {(Object.entries(Q_CONFIG) as [Quadrant, { label: string }][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {deals.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Deal vinculado (opcional)</label>
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                <option value="">— Nenhum —</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              {pending ? "Criando…" : "Criar Tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks,   setTasks]   = useState<Task[]>(SEED);
  const [modal,   setModal]   = useState(false);
  const [deals,   setDeals]   = useState<Deal[]>([]);

  // Carrega deals para o select do modal
  useEffect(() => {
    fetch("/api/deals/list")
      .then((r) => r.ok ? r.json() : { deals: [] })
      .then((d: { deals?: Deal[] }) => setDeals(d.deals ?? []))
      .catch(() => {});
  }, []);

  function addTask(t: Task) {
    setTasks((prev) => [t, ...prev]);
  }

  const byQuadrant = (q: Quadrant) => tasks.filter((t) => t.quadrant === q);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tarefas</h1>
          <p className="text-sm text-gray-500 mt-1">Matriz Eisenhower · {tasks.length} tarefas</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="btn-primary text-sm"
        >
          + Nova Tarefa
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(Object.keys(Q_CONFIG) as Quadrant[]).map((q) => {
          const cfg   = Q_CONFIG[q];
          const items = byQuadrant(q);
          return (
            <div key={q} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</h2>
                <span className="text-xs text-gray-600">{items.length} tarefas</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 bg-gray-900/60 rounded-lg p-2.5">
                    <input type="checkbox" className="mt-0.5 accent-brand-500 flex-shrink-0" readOnly />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 leading-snug">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {t.deal && <span className="text-xs text-brand-400 truncate">↳ {t.deal}</span>}
                        {t.dueAt && <span className="text-xs text-gray-600">{t.dueAt}</span>}
                        {t.assignee && <span className="text-xs text-gray-600 ml-auto">{t.assignee}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-gray-700 text-center py-4">Nenhuma tarefa</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <NewTaskModal
          deals={deals}
          onClose={() => setModal(false)}
          onCreated={addTask}
        />
      )}
    </div>
  );
}
