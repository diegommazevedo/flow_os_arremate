import { z } from "zod";
import type { AgentSkill } from "../runtime";

// ─── Skills padrão do núcleo FlowOS ──────────────────────────────────────────
// Disponíveis para todos os agentes em qualquer setor.

export const dealCreateSkill: AgentSkill = {
  name: "deal.create",
  description: "Cria um novo deal no pipeline Kanban",
  parameters: z.object({
    title: z.string().min(1),
    stageId: z.string().cuid(),
    value: z.number().positive().optional(),
    contactName: z.string().optional(),
    meta: z.record(z.unknown()).optional(),
  }),
  async execute(params, ctx) {
    // Em produção: chama API interna /api/deals
    return {
      success: true,
      message: `Deal "${(params as { title: string }).title}" criado no workspace ${ctx.workspaceId}`,
      dealId: crypto.randomUUID(),
    };
  },
};

export const dealMoveSkill: AgentSkill = {
  name: "deal.move",
  description: "Move um deal para outro stage do Kanban",
  parameters: z.object({
    dealId: z.string().cuid(),
    stageId: z.string().cuid(),
    reason: z.string().optional(),
  }),
  async execute(params, ctx) {
    return {
      success: true,
      message: `Deal ${(params as { dealId: string }).dealId} movido para stage ${(params as { stageId: string }).stageId}`,
      workspaceId: ctx.workspaceId,
    };
  },
};

export const taskCreateSkill: AgentSkill = {
  name: "task.create",
  description: "Cria uma tarefa com prioridade Eisenhower",
  parameters: z.object({
    title: z.string().min(1),
    dealId: z.string().cuid().optional(),
    assigneeId: z.string().optional(),
    urgent: z.boolean().default(false),
    important: z.boolean().default(false),
    dueAt: z.string().datetime().optional(),
  }),
  async execute(params, ctx) {
    const p = params as { title: string; urgent: boolean; important: boolean };
    const quadrant = p.urgent && p.important ? "Q1_DO" :
                     !p.urgent && p.important ? "Q2_PLAN" :
                     p.urgent && !p.important ? "Q3_DELEGATE" : "Q4_ELIMINATE";
    return {
      success: true,
      message: `Tarefa "${p.title}" criada (${quadrant}) no workspace ${ctx.workspaceId}`,
    };
  },
};

export const flowTriggerSkill: AgentSkill = {
  name: "flow.trigger",
  description: "Dispara um flow manualmente para um deal específico",
  parameters: z.object({
    flowId: z.string().cuid(),
    dealId: z.string().cuid().optional(),
    payload: z.record(z.unknown()).optional(),
  }),
  async execute(params, ctx) {
    return {
      success: true,
      message: `Flow ${(params as { flowId: string }).flowId} disparado no workspace ${ctx.workspaceId}`,
    };
  },
};

export const contactUpsertSkill: AgentSkill = {
  name: "contact.upsert",
  description: "Cria ou atualiza um contato",
  parameters: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    type: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
  }),
  async execute(params, ctx) {
    return {
      success: true,
      message: `Contato "${(params as { name: string }).name}" criado/atualizado no workspace ${ctx.workspaceId}`,
      contactId: crypto.randomUUID(),
    };
  },
};

export const analyticsQuerySkill: AgentSkill = {
  name: "analytics.query",
  description: "Consulta métricas do pipeline: conversão, velocidade, SLA",
  parameters: z.object({
    metric: z.enum(["conversion_rate", "avg_deal_value", "pipeline_velocity", "sla_breaches", "deals_by_stage"]),
    period: z.enum(["7d", "30d", "90d", "365d"]).default("30d"),
  }),
  async execute(params, ctx) {
    const p = params as { metric: string; period: string };
    return {
      success: true,
      metric: p.metric,
      period: p.period,
      workspaceId: ctx.workspaceId,
      value: "Consulta executada — dados retornados via API de analytics",
    };
  },
};

export const CORE_SKILLS: AgentSkill[] = [
  dealCreateSkill,
  dealMoveSkill,
  taskCreateSkill,
  flowTriggerSkill,
  contactUpsertSkill,
  analyticsQuerySkill,
];
