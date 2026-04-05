"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DashboardMetrics } from "../_lib/dashboard-queries";
import { CriticalAlerts } from "./CriticalAlerts";
import { PipelineChart }  from "./PipelineChart";
import { AssigneeTable }  from "./AssigneeTable";
import { WorkerStatus }   from "./WorkerStatus";

// ─── Toast system ─────────────────────────────────────────────────────────────

interface Toast {
  id:      string;
  type:    "q1" | "info" | "error";
  message: string;
}

function ToastList({ toasts, onDismiss }: {
  toasts:    Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium
            pointer-events-auto cursor-pointer transition-all
            ${t.type === "q1"    ? "bg-red-900 border-red-700 text-red-100"
            : t.type === "error" ? "bg-gray-900 border-red-800 text-red-300"
                                 : "bg-gray-900 border-gray-700 text-gray-200"}`}
          onClick={() => onDismiss(t.id)}
        >
          <span>{t.type === "q1" ? "🚨" : t.type === "error" ? "⚠️" : "ℹ️"}</span>
          <span>{t.message}</span>
          <span className="ml-1 text-xs opacity-60">×</span>
        </div>
      ))}
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color, pulse,
}: {
  label:  string;
  value:  string;
  sub:    string;
  color:  string;
  pulse?: boolean;
}) {
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color} ${pulse ? "animate-pulse" : ""}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}

// ─── Live Indicator ───────────────────────────────────────────────────────────

function LiveIndicator({
  connected, updatedAt,
}: {
  connected:  boolean;
  updatedAt:  number;
}) {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const fmt = () => {
      if (!updatedAt) { setTimeStr("—"); return; }
      const s = Math.floor((Date.now() - updatedAt) / 1000);
      setTimeStr(s < 5 ? "agora mesmo" : `${s}s atrás`);
    };
    fmt();
    const id = setInterval(fmt, 5_000);
    return () => clearInterval(id);
  }, [updatedAt]);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-gray-600"}`} />
      <span className={connected ? "text-emerald-400" : "text-gray-500"}>
        {connected ? "LIVE" : "RECONECTANDO..."}
      </span>
      {updatedAt > 0 && <span>· Atualizado {timeStr}</span>}
    </div>
  );
}

// ─── Accordion Section ────────────────────────────────────────────────────────

function AccordionSection({
  title, children, defaultOpen = true,
}: {
  title:       string;
  children:    React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="md:contents">
      {/* Mobile toggle — só exibido em telas pequenas */}
      <button
        className="w-full flex items-center justify-between py-2 px-0 text-sm font-semibold text-gray-300 md:hidden"
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        {title}
        <span className="text-gray-600">{open ? "▲" : "▼"}</span>
      </button>
      {/* Content: sempre visível em md+; toggle em mobile */}
      <div className={`${open ? "block" : "hidden"} md:block`}>{children}</div>
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toFixed(0)}`;
}

// ─── Main DashboardClient ─────────────────────────────────────────────────────

interface Props {
  initial:     DashboardMetrics;
  workspaceId: string;
}

export function DashboardClient({ initial, workspaceId }: Props) {
  const [metrics,   setMetrics]   = useState<DashboardMetrics>(initial);
  const [connected, setConnected] = useState(false);
  const [toasts,    setToasts]    = useState<Toast[]>([]);
  const prevQ1IdsRef = useRef<Set<string>>(new Set(initial.criticalDeals.map(d => d.id)));
  const toastIdRef   = useRef(0);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = String(++toastIdRef.current);
    setToasts(prev => [...prev.slice(-3), { ...toast, id }]);   // max 4 toasts
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6_000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── SSE connection ─────────────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource(`/api/sse/dashboard?workspaceId=${workspaceId}`);

      es.addEventListener("connected", () => {
        setConnected(true);
      });

      es.addEventListener("metrics", (e: MessageEvent<string>) => {
        try {
          const next = JSON.parse(e.data) as DashboardMetrics;
          setMetrics(next);

          // Detectar novos deals Q1 → toast
          const nextIds = new Set(next.criticalDeals.map(d => d.id));
          for (const d of next.criticalDeals) {
            if (!prevQ1IdsRef.current.has(d.id)) {
              addToast({ type: "q1", message: `🚨 Novo Q1: ${d.title}` });
            }
          }
          prevQ1IdsRef.current = nextIds;
        } catch { /* parse error silencioso */ }
      });

      es.addEventListener("error", () => {
        setConnected(false);
        es.close();
        retryTimeout = setTimeout(connect, 5_000);
      });

      es.onmessage = (e: MessageEvent<string>) => {
        try {
          const data = JSON.parse(e.data) as { type?: string };
          if (data.type === "HEARTBEAT") setConnected(true);
        } catch { /* ignorar */ }
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, [workspaceId, addToast]);

  // ── Derived metrics strings ────────────────────────────────────────────────
  const m = metrics;
  const q1AtLimit = m.q1Count >= m.q1WipLimit;

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão em tempo real da operação</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/chat"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors border border-gray-700"
          >
            <span>💬</span> Chat
          </Link>
          <Link
            href="/kanban"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors border border-gray-700"
          >
            <span>📋</span> Kanban
          </Link>
          <LiveIndicator connected={connected} updatedAt={m.updatedAt} />
        </div>
      </div>

      {/* ── KPI Grid — 2×3 mobile, 6 colunas desktop ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard
          label="Deals Ativos"
          value={String(m.totalDeals)}
          sub="no pipeline"
          color="text-indigo-400"
        />
        <MetricCard
          label="Q1 Críticos"
          value={`${m.q1Count} / ${m.q1WipLimit}`}
          sub={q1AtLimit ? "⚠ LIMITE ATINGIDO" : "WIP OK"}
          color={q1AtLimit ? "text-red-400" : "text-amber-400"}
          pulse={q1AtLimit}
        />
        <MetricCard
          label="Vencendo 48h"
          value={String(m.deadline48hCount)}
          sub="payment_deadline"
          color={m.deadline48hCount > 0 ? "text-orange-400" : "text-gray-400"}
        />
        <MetricCard
          label="SLA Breach"
          value={String(m.slaBreachCount)}
          sub="hoje"
          color={m.slaBreachCount > 0 ? "text-red-400" : "text-emerald-400"}
        />
        <MetricCard
          label="Receita Proj."
          value={fmtCurrency(m.projectedRevenue)}
          sub="deals ativos"
          color="text-emerald-400"
        />
        <MetricCard
          label="Conv. Semana"
          value={`${m.conversionRate}%`}
          sub="ganhos / criados"
          color={m.conversionRate >= 50 ? "text-emerald-400" : "text-gray-400"}
        />
      </div>

      {/* ── Seções principais ─────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* § 1 — Alertas críticos */}
        <AccordionSection title="🚨 Alertas Críticos (Q1)" defaultOpen>
          <CriticalAlerts
            deals={m.criticalDeals}
            q1Count={m.q1Count}
            q1WipLimit={m.q1WipLimit}
          />
        </AccordionSection>

        {/* § 2 — Pipeline por fase */}
        <AccordionSection title="📊 Pipeline por Fase" defaultOpen>
          <PipelineChart phases={m.pipelineByPhase} totalDeals={m.totalDeals} />
        </AccordionSection>

        {/* § 3 — Performance por assignee */}
        <AccordionSection title="👥 Performance por Assignee" defaultOpen>
          <AssigneeTable rows={m.assigneePerf} />
        </AccordionSection>

        {/* § 4 — Workers */}
        <AccordionSection title="⚙️ RPA + Automações" defaultOpen>
          <WorkerStatus
            rpa={m.workers.rpa}
            paymentBot={m.workers.paymentBot}
            reportGen={m.workers.reportGen}
          />
        </AccordionSection>

      </div>

      {/* ── Toast notifications ───────────────────────────────────────────── */}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
