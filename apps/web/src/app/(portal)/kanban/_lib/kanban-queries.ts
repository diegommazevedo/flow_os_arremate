/**
 * Kanban queries — Server-side only.
 * [SEC-03] WHERE workspaceId obrigatório em todas as queries.
 */

import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { PIPELINE_MASTER_CONFIG, type StageId } from "@flow-os/templates";
import type { KanbanDeal, KanbanStatus, EisenhowerQ, ChannelBadge } from "../_components/types";

// ─── Mapeamentos ──────────────────────────────────────────────────────────────

const QUADRANT_MAP: Record<string, EisenhowerQ> = {
  Q1_DO:       "Q1",
  Q2_PLAN:     "Q2",
  Q3_DELEGATE: "Q3",
  Q4_ELIMINATE:"Q4",
  // fallbacks de meta.eisenhower direto
  Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4",
};

const QUADRANT_ORDER: Record<EisenhowerQ, number> = {
  Q1: 0, Q2: 1, Q3: 2, Q4: 3,
};

const PHASE_COLOR_PALETTE = [
  "#64748b",
  "#475569",
  "#0f766e",
  "#0ea5e9",
  "#f59e0b",
  "#8b5cf6",
  "#2563eb",
  "#ec4899",
  "#06b6d4",
  "#14b8a6",
  "#f97316",
  "#22c55e",
] as const;

const PHASE_COLORS: Record<string, string> = Object.fromEntries(
  PIPELINE_MASTER_CONFIG.stages.map((stage, index) => [
    stage.id,
    PHASE_COLOR_PALETTE[index % PHASE_COLOR_PALETTE.length],
  ]),
) as Record<string, string>;

const ASSIGNEE_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f97316",
  "#ec4899", "#06b6d4", "#ef4444", "#84cc16",
];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0xffffffff;
  }
  return ASSIGNEE_COLORS[Math.abs(hash) % ASSIGNEE_COLORS.length]!;
}

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0] ?? "").slice(0, 2).join("").toUpperCase() || "??";
}

function metaStr(meta: unknown, ...keys: string[]): string {
  const m = meta as Record<string, unknown> | null ?? {};
  for (const k of keys) {
    const v = m[k];
    if (v && typeof v === "string") return v;
  }
  return "";
}

function resolveQuadrant(meta: unknown, taskQuadrant?: string): EisenhowerQ {
  const fromMeta = metaStr(meta, "eisenhower", "quadrant");
  return QUADRANT_MAP[fromMeta] ?? QUADRANT_MAP[taskQuadrant ?? ""] ?? "Q4";
}

function resolveStatus(meta: unknown): KanbanStatus {
  const s = metaStr(meta, "kanbanStatus", "status");
  const valid: KanbanStatus[] = [
    "inbox", "em_progresso", "aguardando_cliente", "aguardando_externo", "concluido",
  ];
  return valid.includes(s as KanbanStatus) ? (s as KanbanStatus) : "inbox";
}

function resolveChannels(meta: unknown): ChannelBadge[] {
  const m = meta as Record<string, unknown> | null ?? {};
  const raw = m["channels"];
  if (Array.isArray(raw)) {
    const valid: ChannelBadge[] = ["WA", "EM", "CH", "RC", "SM"];
    return (raw as string[]).filter((c): c is ChannelBadge => valid.includes(c as ChannelBadge));
  }
  // Inferir do canal mais recente na meta
  const source = metaStr(meta, "lastChannel", "channel");
  if (source === "WHATSAPP" || source === "WA") return ["WA"];
  if (source === "EMAIL" || source === "EM")    return ["EM"];
  if (source === "RC" || source === "ROCKET")   return ["RC"];
  if (source === "SMS" || source === "SM")      return ["SM"];
  return ["WA"]; // default
}

// ─── Query principal ──────────────────────────────────────────────────────────

export async function getKanbanDeals(
  workspaceId: string,
  options?: { stageIds?: StageId[] },
): Promise<KanbanDeal[]> {
  // [SEC-03] workspaceId obrigatório
  const stageFilter: Prisma.DealWhereInput =
    options?.stageIds && options.stageIds.length > 0
      ? { OR: options.stageIds.map((stageId) => ({ meta: { path: ["stageId"], equals: stageId } })) }
      : {};

  const deals = await db.deal.findMany({
    where: {
      workspaceId,
      closedAt: null, // apenas deals ativos
      ...stageFilter,
    },
    include: {
      contact: {
        select: { name: true, phone: true },
      },
      tasks: {
        where:   { completedAt: null },
        orderBy: { dueAt: "asc" },
        take:    1, // task mais urgente para derivar SLA
        select:  { quadrant: true, dueAt: true, assigneeId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const mapped: KanbanDeal[] = deals.map(deal => {
    const meta       = deal.meta;
    const topTask    = deal.tasks[0];

    // Quadrante: meta.eisenhower → task.quadrant → Q4
    const quadrant   = resolveQuadrant(meta, topTask?.quadrant);

    // SLA deadline: meta.paymentDeadline → meta.slaDeadline → task.dueAt → +7d
    const slaMs =
      (() => {
        const dueAt = metaStr(meta, "dueAt");
        if (dueAt) {
          const d = new Date(dueAt).getTime();
          if (!isNaN(d)) return d;
        }
        const legacy = metaStr(meta, "paymentDeadline", "slaDeadline", "limiteBoleto");
        if (legacy) {
          const d = new Date(legacy).getTime();
          if (!isNaN(d)) return d;
        }
        return null;
      })() ??
      topTask?.dueAt?.getTime() ??
      Date.now() + 7 * 24 * 3_600_000;

    // Fase atual
    const phase      = metaStr(meta, "stageId", "currentPhase", "fase", "phase") || "triagem";
    const phaseShort = phase.replace("_", ".").slice(0, 12);
    const phaseColor = PHASE_COLORS[phase] ?? "#6b7280";

    // UF e cidade
    const uf   = metaStr(meta, "uf", "imovelUF", "estado") || "??";
    const city = metaStr(meta, "imovelCidade", "cidade", "city") ||
                 metaStr(meta, "endereco").split(",").at(-2)?.trim() || "";

    // Assignee: ownerId ou meta.corretorNome
    const assigneeName  = metaStr(meta, "corretorNome", "responsibleName", "assigneeName") ||
                          (deal.ownerId ? `User ${deal.ownerId.slice(0, 4)}` : "—");
    const assigneeColor = colorForUser(deal.ownerId ?? assigneeName);

    // Canais
    const channels = resolveChannels(meta);

    // Status Kanban
    const status = resolveStatus(meta);

    // Crítico: Q1 com SLA < 2h
    const isCritical = quadrant === "Q1" && slaMs < Date.now() + 2 * 3_600_000;

    return {
      id:            deal.id,
      arrematante:   deal.contact?.name ?? deal.title,
      city,
      uf,
      value:         deal.value ? Number(deal.value) : 0,
      currentPhase:  phaseShort,
      phaseColor,
      status,
      quadrant,
      slaDeadlineMs: slaMs,
      channels,
      assignee: {
        name:     assigneeName,
        color:    assigneeColor,
        initials: initials(assigneeName),
      },
      isCritical,
    } satisfies KanbanDeal;
  });

  // Ordenar: Q1 primeiro, depois por slaDeadline ASC
  return mapped.sort((a, b) => {
    const qDiff = QUADRANT_ORDER[a.quadrant] - QUADRANT_ORDER[b.quadrant];
    return qDiff !== 0 ? qDiff : a.slaDeadlineMs - b.slaDeadlineMs;
  });
}
