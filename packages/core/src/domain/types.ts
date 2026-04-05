// FlowOS v4 — Primitivos de Domínio
// Tipos fundamentais do núcleo imutável. Nenhum campo de setor aqui.

export type WorkspaceId = string & { readonly _brand: "WorkspaceId" };
export type DealId = string & { readonly _brand: "DealId" };
export type StageId = string & { readonly _brand: "StageId" };
export type ContactId = string & { readonly _brand: "ContactId" };
export type TaskId = string & { readonly _brand: "TaskId" };
export type FlowId = string & { readonly _brand: "FlowId" };
export type AgentId = string & { readonly _brand: "AgentId" };
export type UserId = string & { readonly _brand: "UserId" };

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface Workspace {
  id: WorkspaceId;
  slug: string;
  name: string;
  sector: SectorId;
  settings: Record<string, unknown>;
  planTier: PlanTier;
  createdAt: Date;
  updatedAt: Date;
}

export type SectorId = string;

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

// ─── Deal ─────────────────────────────────────────────────────────────────────

export interface Deal {
  id: DealId;
  workspaceId: WorkspaceId;
  stageId: StageId;
  title: string;
  value: number | null;
  probability: number | null;
  ownerId: UserId | null;
  contactId: ContactId | null;
  closedAt: Date | null;
  expectedCloseDate: Date | null;
  lostReason: string | null;
  /** O campo universal — especificidade de setor vive aqui */
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Stage ────────────────────────────────────────────────────────────────────

export interface Stage {
  id: StageId;
  workspaceId: WorkspaceId;
  name: string;
  color: string;
  position: number;
  wipLimit: number | null;
  slaDays: number | null;
  isWon: boolean;
  isLost: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Contact ──────────────────────────────────────────────────────────────────

export interface Contact {
  id: ContactId;
  workspaceId: WorkspaceId;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  type: "PERSON" | "COMPANY";
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export type EisenhowerQuadrant =
  | "Q1_DO"
  | "Q2_PLAN"
  | "Q3_DELEGATE"
  | "Q4_ELIMINATE";

export interface Task {
  id: TaskId;
  workspaceId: WorkspaceId;
  dealId: DealId | null;
  title: string;
  description: string | null;
  assigneeId: UserId | null;
  quadrant: EisenhowerQuadrant;
  urgent: boolean;
  important: boolean;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Flow ─────────────────────────────────────────────────────────────────────

export type FlowTriggerType = "event" | "cron" | "webhook" | "manual";
export type FlowStepType = "CONDITION" | "ACTION" | "AGENT_CALL" | "WAIT" | "BRANCH";
export type FlowEventStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface FlowTrigger {
  type: FlowTriggerType;
  config: Record<string, unknown>;
}

export interface FlowStep {
  id: string;
  flowId: FlowId;
  position: number;
  type: FlowStepType;
  condition: Record<string, unknown> | null;
  action: Record<string, unknown>;
}

export interface Flow {
  id: FlowId;
  workspaceId: WorkspaceId;
  name: string;
  description: string | null;
  trigger: FlowTrigger;
  isActive: boolean;
  version: number;
  steps: FlowStep[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: AgentId;
  workspaceId: WorkspaceId;
  name: string;
  persona: string;
  skills: string[];
  monthlyBudgetUsd: number;
  usedBudgetThisMonth: number;
  isActive: boolean;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrainMemory {
  id: string;
  workspaceId: WorkspaceId;
  agentId: AgentId;
  content: string;
  source: "interaction" | "pattern" | "manual";
  relevance: number;
  expiresAt: Date;
  createdAt: Date;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class FlowOSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FlowOSError";
  }
}

export class ForbiddenError extends FlowOSError {
  constructor(constraint?: string) {
    super(
      `Acesso negado${constraint ? ` — ${constraint}` : ""}`,
      "FORBIDDEN",
    );
  }
}

export class BudgetExceededError extends FlowOSError {
  constructor(agentId: string) {
    super(
      `Orçamento mensal do agente ${agentId} esgotado [SEC-07]`,
      "BUDGET_EXCEEDED",
    );
  }
}

export class TenantIsolationError extends FlowOSError {
  constructor() {
    super(
      "Query sem filtro de workspaceId detectada [SEC-01]",
      "TENANT_ISOLATION",
    );
  }
}
