"use client";

import { useState, useCallback } from "react";
import type { AssigneeRow } from "../_lib/dashboard-queries";

// ─── Sort logic ───────────────────────────────────────────────────────────────

type SortKey = keyof Pick<AssigneeRow,
  "name" | "activeDeals" | "q1Count" | "slaBreachCount" | "completedThisWeek"
>;

type SortDir = "asc" | "desc";

function sortRows(rows: AssigneeRow[], key: SortKey, dir: SortDir): AssigneeRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const cmp = typeof av === "string" && typeof bv === "string"
      ? av.localeCompare(bv, "pt-BR")
      : Number(av) - Number(bv);
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Column definitions ────────────────────────────────────────────────────────

const COLUMNS: { key: SortKey; label: string; align: "left" | "center" | "right" }[] = [
  { key: "name",              label: "Nome",            align: "left"   },
  { key: "activeDeals",       label: "Ativos",          align: "center" },
  { key: "q1Count",           label: "Q1",              align: "center" },
  { key: "slaBreachCount",    label: "SLA Breach",      align: "center" },
  { key: "completedThisWeek", label: "Concl. / Semana", align: "center" },
];

const PANEL =
  "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  rows: AssigneeRow[];
}

export function AssigneeTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("activeDeals");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback((key: SortKey) => {
    setSortDir(prev => (key === sortKey ? (prev === "desc" ? "asc" : "desc") : "desc"));
    setSortKey(key);
  }, [sortKey]);

  const sorted = sortRows(rows, sortKey, sortDir);

  if (rows.length === 0) {
    return (
      <div className={PANEL}>
        <h2 className="font-semibold text-white mb-4">👥 Performance por Assignee</h2>
        <p className="text-sm text-gray-500">Nenhum assignee com deals ativos.</p>
      </div>
    );
  }

  return (
    <div className={PANEL}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">👥</span>
        <h2 className="font-semibold text-white">Performance por Assignee</h2>
        <span className="text-xs text-gray-600">· clique no cabeçalho para ordenar</span>
      </div>

      {/* Table wrapper — horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-gray-800">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`pb-2 font-medium text-gray-400 cursor-pointer hover:text-white transition-colors select-none ${
                    col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center gap-1 whitespace-nowrap justify-start">
                    {col.align !== "left" && <span className="flex-1" />}
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-indigo-400 text-xs">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th className="pb-2 text-right font-medium text-gray-400">Carga</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-800/60">
            {sorted.map(row => (
              <AssigneeRow key={row.userId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssigneeRow({ row }: { row: AssigneeRow }) {
  return (
    <tr className="hover:bg-gray-800/30 transition-colors group">
      {/* Name + avatar */}
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: row.color }}
          >
            {row.initials}
          </div>
          <span className="text-white font-medium truncate max-w-[120px]">{row.name}</span>
        </div>
      </td>

      {/* Active deals */}
      <td className="py-2.5 text-center">
        <span className="font-semibold text-white tabular-nums">{row.activeDeals}</span>
      </td>

      {/* Q1 */}
      <td className="py-2.5 text-center">
        {row.q1Count > 0 ? (
          <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-xs font-bold border border-red-800">
            {row.q1Count}
          </span>
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </td>

      {/* SLA Breach */}
      <td className="py-2.5 text-center">
        {row.slaBreachCount > 0 ? (
          <span className="text-amber-400 font-semibold tabular-nums">{row.slaBreachCount}</span>
        ) : (
          <span className="text-emerald-500">✓</span>
        )}
      </td>

      {/* Completed this week */}
      <td className="py-2.5 text-center">
        <span className={`font-semibold tabular-nums ${row.completedThisWeek > 0 ? "text-emerald-400" : "text-gray-600"}`}>
          {row.completedThisWeek > 0 ? `+${row.completedThisWeek}` : "0"}
        </span>
      </td>

      {/* Overload badge */}
      <td className="py-2.5 text-right">
        {row.isOverloaded ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-800 whitespace-nowrap">
            SOBRECARREGADO
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/30 text-emerald-500 border border-emerald-900/50 whitespace-nowrap">
            OK
          </span>
        )}
      </td>
    </tr>
  );
}
