"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActivityRow } from "../_lib/activity-queries";

const QUICK_FILTERS = [
  { id: "all", label: "Tudo" },
  { id: "todo", label: "Para fazer" },
  { id: "overdue", label: "Vencido" },
  { id: "today", label: "Hoje" },
  { id: "tomorrow", label: "Amanhã" },
  { id: "week", label: "Esta semana" },
] as const;

type QuickFilterId = (typeof QUICK_FILTERS)[number]["id"];

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function isSameDate(date: Date, target: Date): boolean {
  return date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate();
}

function isInCurrentWeek(date: Date, today: Date): boolean {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - today.getDay() + 1);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return date >= start && date <= end;
}

function matchesQuickFilter(row: ActivityRow, filter: QuickFilterId): boolean {
  if (filter === "all") return true;
  if (filter === "todo") return !row.completedAt;
  if (!row.dueAt) return false;

  const dueDate = new Date(row.dueAt);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (filter === "overdue") return !row.completedAt && dueDate < today;
  if (filter === "today") return isSameDate(dueDate, today);
  if (filter === "tomorrow") return isSameDate(dueDate, tomorrow);
  if (filter === "week") return isInCurrentWeek(dueDate, today);
  return true;
}

async function toggleTask(id: string, completed: boolean): Promise<void> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });

  if (!response.ok) {
    throw new Error("Falha ao atualizar atividade");
  }
}

export function ActivitiesClient({
  initialRows,
  openCount,
}: {
  initialRows: ActivityRow[];
  openCount: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<QuickFilterId>("all");
  const [pending, startTransition] = useTransition();

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesQuickFilter(row, filter)),
    [filter, rows],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Atividades</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vista operacional equivalente ao activities/list do Pipedrive.
          </p>
        </div>
        <div className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
          {openCount} em aberto
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === item.id
                ? "border-brand-500 bg-brand-500 text-gray-950"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-white",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800 text-sm">
            <thead className="bg-gray-900/80">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Concluído</th>
                <th className="px-4 py-3">Assunto</th>
                <th className="px-4 py-3">Negócio</th>
                <th className="px-4 py-3">Prioridade</th>
                <th className="px-4 py-3">Pessoa</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Tel</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredRows.map((row) => (
                <tr key={row.id} className="align-top text-gray-200">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(row.completedAt)}
                      disabled={pending}
                      onChange={(event) => {
                        const completed = event.target.checked;
                        startTransition(async () => {
                          await toggleTask(row.id, completed);
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, completedAt: completed ? new Date().toISOString() : null }
                                : item,
                            ),
                          );
                        });
                      }}
                      className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-brand-500 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.subject}</div>
                    {row.type && <div className="mt-1 text-xs text-gray-500">{row.type}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{row.dealTitle ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-xs font-semibold",
                        row.priority === "HIGH" && "bg-red-500/10 text-red-300",
                        row.priority === "MEDIUM" && "bg-amber-500/10 text-amber-300",
                        row.priority === "LOW" && "bg-emerald-500/10 text-emerald-300",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{row.person ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{row.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{row.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-300">{formatDate(row.dueAt)}</td>
                  <td className="px-4 py-3 text-gray-300">{row.assigneeId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            Nenhuma atividade encontrada neste filtro.
          </div>
        )}
      </div>
    </div>
  );
}
