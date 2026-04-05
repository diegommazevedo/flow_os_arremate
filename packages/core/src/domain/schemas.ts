import { z } from "zod";

// ─── IDs ──────────────────────────────────────────────────────────────────────

export const WorkspaceIdSchema = z.string().cuid();
export const DealIdSchema = z.string().cuid();
export const StageIdSchema = z.string().cuid();

// ─── Workspace ────────────────────────────────────────────────────────────────

export const SectorIdSchema = z.enum([
  "real-estate",
  "clinic",
  "law-firm",
  "construction",
  "hospitality",
]);

export const CreateWorkspaceSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  name: z.string().min(2).max(100),
  sector: SectorIdSchema,
  settings: z.record(z.unknown()).default({}),
});

// ─── Deal ─────────────────────────────────────────────────────────────────────

export const CreateDealSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  stageId: StageIdSchema,
  title: z.string().min(1).max(255),
  value: z.number().positive().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  contactId: z.string().cuid().optional(),
  expectedCloseDate: z.coerce.date().optional(),
  meta: z.record(z.unknown()).default({}),
});

export const UpdateDealSchema = CreateDealSchema.partial().omit({
  workspaceId: true,
});

export const MoveDealSchema = z.object({
  dealId: DealIdSchema,
  stageId: StageIdSchema,
  workspaceId: WorkspaceIdSchema,
});

// ─── Stage ────────────────────────────────────────────────────────────────────

export const CreateStageSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6366f1"),
  position: z.number().int().min(0),
  wipLimit: z.number().int().positive().optional(),
  slaDays: z.number().int().positive().optional(),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});

// ─── Contact ──────────────────────────────────────────────────────────────────

export const CreateContactSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  document: z.string().max(20).optional(),
  type: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
  meta: z.record(z.unknown()).default({}),
});

// ─── Task ─────────────────────────────────────────────────────────────────────

export const EisenhowerQuadrantSchema = z.enum([
  "Q1_DO",
  "Q2_PLAN",
  "Q3_DELEGATE",
  "Q4_ELIMINATE",
]);

export const CreateTaskSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  dealId: z.string().cuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  assigneeId: z.string().optional(),
  urgent: z.boolean().default(false),
  important: z.boolean().default(false),
  dueAt: z.coerce.date().optional(),
});

// ─── Flow ─────────────────────────────────────────────────────────────────────

export const FlowTriggerSchema = z.object({
  type: z.enum(["event", "cron", "webhook", "manual"]),
  config: z.record(z.unknown()),
});

export const FlowStepSchema = z.object({
  position: z.number().int().min(0),
  type: z.enum(["CONDITION", "ACTION", "AGENT_CALL", "WAIT", "BRANCH"]),
  condition: z.record(z.unknown()).nullable().default(null),
  action: z.record(z.unknown()),
});

export const CreateFlowSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  trigger: FlowTriggerSchema,
  steps: z.array(FlowStepSchema).min(1),
});

// ─── Agent ────────────────────────────────────────────────────────────────────

export const CreateAgentSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(100),
  persona: z.string().max(500).default("Assistente profissional e objetivo."),
  skills: z.array(z.string()).default([]),
  monthlyBudgetUsd: z.number().positive().default(50),
});

export const AgentRunInputSchema = z.object({
  agentId: z.string().cuid(),
  workspaceId: WorkspaceIdSchema,
  input: z.string().min(1).max(8000), // SEC-08: limite de tamanho
  context: z.record(z.unknown()).default({}),
});
