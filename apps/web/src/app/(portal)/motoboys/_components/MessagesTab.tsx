"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditEntry {
  id: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
}

function formatTime(d: string): string {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function MessagesTab() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/field-agents/audit?action=FIELD_AGENT_CONTACTED&page=${page}&limit=50`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{total} mensagens enviadas</p>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-raised)" }}>
              {["Horário", "Motoboy", "Deal", "Telefone", "Retry?"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>Nenhuma mensagem</td></tr>
            ) : items.map((a) => (
              <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>{formatTime(a.createdAt)}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{String(a.input["agentName"] ?? "—")}</td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>{String(a.input["dealId"] ?? "—").slice(0, 8)}...</td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>****{String(a.input["phoneSuffix"] ?? "")}</td>
                <td className="px-3 py-2">
                  {Boolean(a.input["isRetry"]) ? (
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ color: "#F59E0B", background: "rgba(245,158,11,0.12)" }}>retry</span>
                  ) : null}
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
