"use client";

import { useState, useEffect, useCallback } from "react";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  FIELD_AGENT_CONTACTED:      { label: "Contactado",     color: "#3B82F6" },
  FIELD_AGENT_NO_RESPONSE:    { label: "Sem resposta",   color: "var(--color-q1)" },
  FIELD_AGENT_POOL_EXHAUSTED: { label: "Pool esgotado",  color: "#F59E0B" },
  CAMPAIGN_ITEM_PROCESSED:    { label: "Campanha item",  color: "#8B5CF6" },
};

const ACTIONS = ["", "FIELD_AGENT_CONTACTED", "FIELD_AGENT_NO_RESPONSE", "FIELD_AGENT_POOL_EXHAUSTED"];

interface AuditEntry {
  id: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  success: boolean;
  error: string | null;
  createdAt: string;
}

function formatTime(d: string): string {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AuditTab() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (action) params.set("action", action);
    const res = await fetch(`/api/field-agents/audit?${params}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
          <option value="">Todas as ações</option>
          {ACTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{total} eventos</span>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Carregando...</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Nenhum evento</p>
      ) : (
        <div className="relative ml-4 space-y-0 border-l-2" style={{ borderColor: "var(--border-subtle)" }}>
          {items.map((entry) => {
            const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, color: "var(--text-tertiary)" };
            return (
              <div key={entry.id} className="relative pb-4 pl-6">
                {/* Dot */}
                <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2"
                  style={{ borderColor: meta.color, background: "var(--surface-base)" }} />
                {/* Content */}
                <div className="rounded-md border p-3" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{formatTime(entry.createdAt)}</span>
                    {!entry.success && (
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ color: "var(--color-q1)", background: "rgba(232,64,64,0.12)" }}>erro</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {entry.input["agentName"] != null && entry.input["agentName"] !== "" ? (
                      <span>Motoboy: {String(entry.input["agentName"])} </span>
                    ) : null}
                    {entry.input["dealId"] != null && entry.input["dealId"] !== "" ? (
                      <span>| Deal: {String(entry.input["dealId"]).slice(0, 8)}... </span>
                    ) : null}
                    {entry.output["status"] != null && entry.output["status"] !== "" ? (
                      <span>| Status: {String(entry.output["status"])} </span>
                    ) : null}
                    {entry.input["triedCount"] !== undefined ? (
                      <span>| Tentativas: {String(entry.input["triedCount"])} </span>
                    ) : null}
                  </div>
                  {entry.error && <p className="mt-1 text-xs" style={{ color: "var(--color-q1)" }}>{entry.error}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
