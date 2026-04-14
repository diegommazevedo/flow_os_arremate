"use client";

import { useState, useEffect, useCallback } from "react";

interface QueueData {
  counts: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  recentFailed: { id: string; failedReason: string; attemptsMade: number }[];
  scheduledJobs: { id: string; data: Record<string, unknown>; delay: number }[];
  error?: string;
}

const CARDS = [
  { key: "waiting",   label: "Aguardando", color: "#F59E0B" },
  { key: "active",    label: "Ativos",     color: "#3B82F6" },
  { key: "completed", label: "Concluídos", color: "var(--color-success)" },
  { key: "failed",    label: "Falhas",     color: "var(--color-q1)" },
  { key: "delayed",   label: "Agendados",  color: "#8B5CF6" },
] as const;

export function QueueTab() {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/field-agents/queue");
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Carregando fila...</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {data.error && (
        <p className="text-xs" style={{ color: "var(--color-q1)" }}>{data.error}</p>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {CARDS.map((c) => (
          <div key={c.key} className="rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)", borderTop: `3px solid ${c.color}`, background: "var(--surface-raised)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {data.counts[c.key] ?? 0}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Failed jobs */}
      {data.recentFailed.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium" style={{ color: "var(--color-q1)" }}>Falhas recentes</h4>
          <div className="space-y-2">
            {data.recentFailed.map((j) => (
              <div key={j.id} className="rounded-md border p-3 text-xs" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}>
                <span style={{ color: "var(--text-primary)" }}>Job {j.id}</span>
                <span className="ml-2" style={{ color: "var(--text-tertiary)" }}>({j.attemptsMade} tentativas)</span>
                <p className="mt-1" style={{ color: "var(--color-q1)" }}>{j.failedReason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduled jobs */}
      {data.scheduledJobs.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium" style={{ color: "#8B5CF6" }}>Jobs agendados</h4>
          <div className="space-y-2">
            {data.scheduledJobs.map((j) => (
              <div key={j.id} className="rounded-md border p-3 text-xs" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}>
                <span style={{ color: "var(--text-primary)" }}>Job {j.id}</span>
                <span className="ml-2" style={{ color: "var(--text-tertiary)" }}>
                  delay: {Math.round(j.delay / 60000)}min
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
