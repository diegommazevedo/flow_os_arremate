"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "./StatusBadge";

function relativeTime(date: string | null): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ontem" : `${days}d atrás`;
}

interface Assignment {
  id: string;
  dealId: string;
  dealTitle: string;
  agentName: string;
  status: string;
  priceAgreed: number | null;
  evidenceCount: number;
  contactedAt: string | null;
  createdAt: string;
}

const STATUSES = ["", "PENDING_CONTACT", "CONTACTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "REJECTED", "NO_RESPONSE", "CANCELLED"];

export function AssignmentsTab() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (status) params.set("status", status);
    const res = await fetch(`/api/field-agents/assignments?${params}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (id: string) => {
    if (!confirm("Cancelar este assignment?")) return;
    await fetch(`/api/field-agents/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
          <option value="">Todos os status</option>
          {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{total} resultados</span>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-raised)" }}>
              {["Deal", "Motoboy", "Status", "Contactado", "Evidências", "Preço", "Ações"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>Nenhum assignment</td></tr>
            ) : items.map((a) => (
              <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: "var(--text-primary)" }}>{a.dealTitle}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{a.agentName}</td>
                <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>{relativeTime(a.contactedAt)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{
                    background: a.evidenceCount > 0 ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                    color: a.evidenceCount > 0 ? "var(--color-success)" : "var(--text-tertiary)",
                  }}>{a.evidenceCount}</span>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{a.priceAgreed ? `R$ ${a.priceAgreed.toFixed(2)}` : "—"}</td>
                <td className="px-3 py-2">
                  {!["COMPLETED", "CANCELLED"].includes(a.status) && (
                    <button onClick={() => cancel(a.id)} className="text-xs underline" style={{ color: "var(--color-q1)" }}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="text-sm disabled:opacity-30" style={{ color: "var(--text-accent)" }}>Anterior</button>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Página {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total}
            className="text-sm disabled:opacity-30" style={{ color: "var(--text-accent)" }}>Próxima</button>
        </div>
      )}
    </div>
  );
}
