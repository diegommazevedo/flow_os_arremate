/**
 * FlowOS v4 — Dashboard Queries
 * Todas as queries são MULTI-TENANT: sempre filtradas por workspaceId.
 *
 * Estratégia: fetch de todos os deals ativos uma única vez e derivação em JS.
 * Adequado para até ~500 deals; para escala maior, substituir por raw SQL.
 */

import { db } from "@flow-os/db";
import type { Deal, Stage, Contact } from "@flow-os/db";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ChannelBadge = "WA" | "EM" | "CH" | "RC" | "SM";

export interface CriticalDeal {
  id:                string;
  title:             string;
  actorName:         string;
  assigneeId:        string | null;
  assigneeName:      string;
  assigneeInitials:  string;
  assigneeColor:     string;
  channels:          ChannelBadge[];
  paymentDeadlineMs: number;          // epoch ms para countdown
}

export interface PhaseStat {
  phase:       string;
  stageId:     string;
  count:       number;
  breachCount: number;
  health:      "green" | "amber" | "red";
  slaDays:     number | null;
  maxAgeDays:  number;               // oldest deal age in this stage
}

export interface AssigneeRow {
  userId:             string;
  name:               string;
  initials:           string;
  color:              string;
  activeDeals:        number;
  q1Count:            number;
  slaBreachCount:     number;
  completedThisWeek:  number;
  isOverloaded:       boolean;
}

export interface WorkerStat {
  name:          string;
  lastRunAt:     number | null;     // epoch ms
  status:        "ok" | "error" | "idle" | "running";
  rowsFound:     number;
  rowsNew:       number;
  jobsPending:   number;
  sentToday:     number;
  docsToday:     number;
  failuresToday: number;
  detail:        string;
}

export interface DashboardMetrics {
  updatedAt:        number;
  totalDeals:       number;
  q1Count:          number;
  q1WipLimit:       number;
  deadline48hCount: number;
  slaBreachCount:   number;
  projectedRevenue: number;
  conversionRate:   number;
  criticalDeals:    CriticalDeal[];
  pipelineByPhase:  PhaseStat[];
  assigneePerf:     AssigneeRow[];
  workers: {
    rpa:        WorkerStat;
    paymentBot: WorkerStat;
    reportGen:  WorkerStat;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DealWithRelations = Deal & {
  stage:   Stage;
  contact: Contact | null;
};

const Q1_WIP_LIMIT = 3;
const OVERLOAD_LIMIT = 12;

const ASSIGNEE_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
];

function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return ASSIGNEE_PALETTE[h % ASSIGNEE_PALETTE.length] ?? "#6366f1";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => (w[0] ?? "").toUpperCase())
    .join("");
}

function metaStr(meta: unknown, key: string): string {
  if (meta && typeof meta === "object" && key in (meta as object)) {
    const v = (meta as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  }
  return "";
}

function metaDeadline(meta: unknown): Date | null {
  const raw = metaStr(meta, "paymentDeadline");
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function ageDays(createdAt: Date): number {
  return Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
}

// ─── Query principal ──────────────────────────────────────────────────────────

async function fetchDeals(workspaceId: string): Promise<DealWithRelations[]> {
  return db.deal.findMany({
    where:   { workspaceId },
    include: { stage: true, contact: true },
    orderBy: { createdAt: "desc" },
  }) as Promise<DealWithRelations[]>;
}

async function fetchRpaStats(workspaceId: string): Promise<WorkerStat> {
  try {
    const last = await db.rpaLog.findFirst({
      where:   { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    if (!last) {
      return {
        name: "Importador automático", lastRunAt: null, status: "idle",
        rowsFound: 0, rowsNew: 0, jobsPending: 0,
        sentToday: 0, docsToday: 0, failuresToday: 0,
        detail: "Nenhuma execução registrada",
      };
    }

    const status = last.status === "SUCCESS" ? "ok"
                 : last.status === "FAILED"  ? "error"
                 : "idle";

    return {
      name:          "Importador automático",
      lastRunAt:     last.createdAt.getTime(),
      status,
      rowsFound:     last.rowsFound,
      rowsNew:       last.rowsNew,
      jobsPending:   0,
      sentToday:     0,
      docsToday:     0,
      failuresToday: last.status === "FAILED" ? 1 : 0,
      detail:        last.errorMessage ?? `${last.rowsNew} novos de ${last.rowsFound} encontrados`,
    };
  } catch {
    return {
      name: "Importador automático", lastRunAt: null, status: "idle",
      rowsFound: 0, rowsNew: 0, jobsPending: 0,
      sentToday: 0, docsToday: 0, failuresToday: 0,
      detail: "Dados indisponíveis",
    };
  }
}

async function fetchAuditStats(workspaceId: string): Promise<{
  paymentSentToday: number;
  paymentPending:   number;
  docsToday:        number;
  docsFailed:       number;
}> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  try {
    const [paymentAudit, docAudit] = await Promise.all([
      db.agentAuditLog.count({
        where: {
          workspaceId,
          action: { startsWith: "payment_recovery" },
          createdAt: { gte: startOfDay },
          success: true,
        },
      }),
      db.document.count({
        where: {
          workspaceId,
          createdAt: { gte: startOfDay },
          collection: "deal_docs",
        },
      }),
    ]);

    return {
      paymentSentToday: paymentAudit,
      paymentPending:   0,         // BullMQ queue stats — seria via Redis em produção
      docsToday:        docAudit,
      docsFailed:       0,
    };
  } catch {
    return { paymentSentToday: 0, paymentPending: 0, docsToday: 0, docsFailed: 0 };
  }
}

// ─── Exported function ────────────────────────────────────────────────────────

export async function getDashboardMetrics(workspaceId: string): Promise<DashboardMetrics> {
  const now       = Date.now();
  const h48       = now + 48 * 3600 * 1000;
  const weekStart = new Date(now - 7 * 86_400_000);

  const [allDeals, rpaStats, auditStats] = await Promise.all([
    fetchDeals(workspaceId),
    fetchRpaStats(workspaceId),
    fetchAuditStats(workspaceId),
  ]);

  // ── Partition ─────────────────────────────────────────────────────────────
  const activeDeals = allDeals.filter(d => !d.stage.isWon && !d.stage.isLost);
  const wonThisWeek = allDeals.filter(
    d => d.stage.isWon && d.closedAt && d.closedAt >= weekStart,
  );
  const createdThisWeek = allDeals.filter(d => d.createdAt >= weekStart);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalDeals = activeDeals.length;

  const q1Deals = activeDeals.filter(d => metaStr(d.meta, "eisenhower") === "Q1_DO");
  const q1Count  = q1Deals.length;

  const deadline48hCount = activeDeals.filter(d => {
    const dl = metaDeadline(d.meta);
    return dl !== null && dl.getTime() <= h48 && dl.getTime() >= now;
  }).length;

  const slaBreachCount = activeDeals.filter(d => {
    if (!d.stage.slaDays) return false;
    return ageDays(d.createdAt) > d.stage.slaDays;
  }).length;

  const projectedRevenue = activeDeals.reduce((sum, d) => {
    return sum + Number(d.value ?? 0);
  }, 0);

  const conversionRate = createdThisWeek.length > 0
    ? Math.round((wonThisWeek.length / createdThisWeek.length) * 100)
    : 0;

  // ── Critical deals ────────────────────────────────────────────────────────
  const criticalDeals: CriticalDeal[] = q1Deals.slice(0, 10).map(d => {
    const dl   = metaDeadline(d.meta);
    const name = d.contact?.name ?? "Sem contato";
    const uid  = d.ownerId ?? "";

    return {
      id:                d.id,
      title:             d.title,
      actorName:         name,
      assigneeId:        d.ownerId,
      assigneeName:      d.ownerId ? `Assignee ${d.ownerId.slice(-4)}` : "Não atribuído",
      assigneeInitials:  d.ownerId ? initials(`Assignee ${d.ownerId.slice(-4)}`) : "NA",
      assigneeColor:     hashColor(uid),
      channels:          ["WA", "RC"] as ChannelBadge[],
      paymentDeadlineMs: dl?.getTime() ?? (now + 3_600_000),
    };
  });

  // ── Pipeline by phase (stage) ─────────────────────────────────────────────
  const stageMap = new Map<string, { stage: Stage; deals: DealWithRelations[] }>();
  for (const d of activeDeals) {
    const key = d.stage.id;
    if (!stageMap.has(key)) stageMap.set(key, { stage: d.stage, deals: [] });
    stageMap.get(key)!.deals.push(d);
  }

  const pipelineByPhase: PhaseStat[] = Array.from(stageMap.values())
    .sort((a, b) => a.stage.position - b.stage.position)
    .map(({ stage, deals }) => {
      const breachCount = deals.filter(d => {
        if (!stage.slaDays) return false;
        return ageDays(d.createdAt) > stage.slaDays;
      }).length;

      const maxAge = deals.reduce((m, d) => Math.max(m, ageDays(d.createdAt)), 0);

      const health: PhaseStat["health"] =
        breachCount > 0                            ? "red"
        : (stage.slaDays && maxAge >= stage.slaDays * 0.8) ? "amber"
        : "green";

      return {
        phase:       stage.name,
        stageId:     stage.id,
        count:       deals.length,
        breachCount,
        health,
        slaDays:     stage.slaDays,
        maxAgeDays:  maxAge,
      };
    });

  // ── Assignee performance ──────────────────────────────────────────────────
  const assigneeMap = new Map<string, {
    activeDeals: DealWithRelations[];
    q1: number;
    breach: number;
    wonWeek: number;
  }>();

  for (const d of activeDeals) {
    const uid = d.ownerId ?? "__unassigned__";
    if (!assigneeMap.has(uid)) {
      assigneeMap.set(uid, { activeDeals: [], q1: 0, breach: 0, wonWeek: 0 });
    }
    const entry = assigneeMap.get(uid)!;
    entry.activeDeals.push(d);
    if (metaStr(d.meta, "eisenhower") === "Q1_DO") entry.q1++;
    if (d.stage.slaDays && ageDays(d.createdAt) > d.stage.slaDays) entry.breach++;
  }

  for (const d of wonThisWeek) {
    const uid = d.ownerId ?? "__unassigned__";
    if (!assigneeMap.has(uid)) {
      assigneeMap.set(uid, { activeDeals: [], q1: 0, breach: 0, wonWeek: 0 });
    }
    assigneeMap.get(uid)!.wonWeek++;
  }

  const assigneePerf: AssigneeRow[] = Array.from(assigneeMap.entries()).map(([uid, e]) => {
    const label = uid === "__unassigned__" ? "Não atribuído" : `Assignee ${uid.slice(-4)}`;
    return {
      userId:            uid,
      name:              label,
      initials:          initials(label),
      color:             hashColor(uid),
      activeDeals:       e.activeDeals.length,
      q1Count:           e.q1,
      slaBreachCount:    e.breach,
      completedThisWeek: e.wonWeek,
      isOverloaded:      e.activeDeals.length > OVERLOAD_LIMIT,
    };
  }).sort((a, b) => b.activeDeals - a.activeDeals);

  // ── Workers ───────────────────────────────────────────────────────────────
  const paymentBot: WorkerStat = {
    name:          "PaymentRecoveryBot",
    lastRunAt:     null,
    status:        "ok",
    rowsFound:     0,
    rowsNew:       0,
    jobsPending:   auditStats.paymentPending,
    sentToday:     auditStats.paymentSentToday,
    docsToday:     0,
    failuresToday: 0,
    detail:        `${auditStats.paymentSentToday} alertas enviados hoje`,
  };

  const reportGen: WorkerStat = {
    name:          "Gerador de Relatórios",
    lastRunAt:     null,
    status:        auditStats.docsFailed > 0 ? "error" : "ok",
    rowsFound:     0,
    rowsNew:       0,
    jobsPending:   0,
    sentToday:     0,
    docsToday:     auditStats.docsToday,
    failuresToday: auditStats.docsFailed,
    detail:        `${auditStats.docsToday} PDFs gerados hoje`,
  };

  return {
    updatedAt: now,
    totalDeals,
    q1Count,
    q1WipLimit: Q1_WIP_LIMIT,
    deadline48hCount,
    slaBreachCount,
    projectedRevenue,
    conversionRate,
    criticalDeals,
    pipelineByPhase,
    assigneePerf,
    workers: { rpa: rpaStats, paymentBot, reportGen },
  };
}

