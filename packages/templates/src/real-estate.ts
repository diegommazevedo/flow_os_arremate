import { z } from "zod";
import type { SectorTemplate, StageConfig } from "./engine";
import { globalRegistry } from "./engine";

// ─── Template: Imobiliária Caixa ──────────────────────────────────────────────

export const RealEstateMetaSchema = z.object({
  propertyType: z.enum(["apartment", "house", "commercial", "land"]),
  propertyValue: z.number().min(0),
  caixaFinancing: z.boolean().default(true),
  caixaProgram: z.enum(["MCMV", "SFH", "SFI", "CVA"]).optional(),
  financingValue: z.number().optional(),
  fgtsValue: z.number().optional(),
  address: z.object({
    cep: z.string().length(8),
    street: z.string(),
    city: z.string(),
    state: z.string().length(2),
  }),
  registryNumber: z.string().optional(),
  sellerContact: z.string().optional(),
});

export type RealEstateMeta = z.infer<typeof RealEstateMetaSchema>;

export const RealEstateStages: StageConfig[] = [
  { name: "Captação",       color: "#8b5cf6", slaDays: 3 },
  { name: "Qualificação",   color: "#6366f1", slaDays: 5 },
  { name: "Simulação Caixa",color: "#3b82f6", slaDays: 7 },
  { name: "Documentação",   color: "#06b6d4", slaDays: 14 },
  { name: "Aprovação",      color: "#f59e0b", slaDays: 20, wipLimit: 10 },
  { name: "Contrato",       color: "#10b981", slaDays: 7 },
  { name: "Chaves",         color: "#22c55e", isWon: true },
  { name: "Perdido",        color: "#ef4444", isLost: true },
];

export const RealEstateTemplate: SectorTemplate = {
  id: "real-estate",
  name: "Imobiliária Caixa",
  stages: RealEstateStages,
  dealMetaSchema: RealEstateMetaSchema,
  vocabulary: {
    deal: "Imóvel",
    contact: "Cliente",
    stage: "Etapa",
    value: "VGV",
    agent: "Corretor IA",
    flow: "Processo",
  },
  agentPersona: {
    name: "Corretor IA",
    persona:
      "Você é o Corretor IA da imobiliária, especialista em financiamento Caixa, " +
      "Minha Casa Minha Vida (MCMV), SFH e SFI. Conhece os documentos necessários, " +
      "prazos do processo e regras de aprovação. Seja objetivo, claro e proativo.",
    skills: [
      "deal.create",
      "deal.move",
      "task.create",
      "contact.upsert",
      "flow.trigger",
      "analytics.query",
    ],
  },
  defaultFlows: [
    {
      name: "Auto-simulação Caixa",
      description: "Quando deal entra em Simulação → agente calcula parcelas automaticamente",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Simulação Caixa" } },
      steps: [
        {
          type: "ACTION",
          action: { type: "agent_call", agentSkill: "deal.simulate_caixa", auto: true },
        },
      ],
    },
    {
      name: "Checklist de Documentação",
      description: "Quando deal entra em Documentação → cria tarefas para cada documento",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Documentação" } },
      steps: [
        {
          type: "ACTION",
          action: {
            type: "task.create_batch",
            tasks: [
              { title: "RG e CPF do comprador", urgent: false, important: true },
              { title: "Comprovante de renda (3 últimos)", urgent: false, important: true },
              { title: "Comprovante de residência", urgent: false, important: true },
              { title: "Extrato FGTS (se usar)", urgent: false, important: true },
              { title: "Certidão de nascimento/casamento", urgent: false, important: true },
              { title: "Matrícula do imóvel atualizada", urgent: false, important: true },
            ],
          },
        },
      ],
    },
    {
      name: "Alerta SLA Aprovação",
      description: "Se deal ficou 7+ dias em Aprovação → notifica responsável",
      trigger: { type: "cron", config: { schedule: "0 9 * * 1-5" } },
      steps: [
        {
          type: "CONDITION",
          action: {},
          // condition: { field: "deal.daysInStage", operator: ">=", value: 7 }
        },
        {
          type: "ACTION",
          action: { type: "notification", channel: "email", template: "sla_breach_approval" },
        },
      ],
    },
    {
      name: "Relatório Semanal do Pipeline",
      description: "Toda segunda-feira → Brain gera resumo do pipeline",
      trigger: { type: "cron", config: { schedule: "0 8 * * 1" } },
      steps: [
        {
          type: "ACTION",
          action: { type: "agent_call", agentSkill: "analytics.query", metric: "pipeline_velocity", period: "7d" },
        },
        {
          type: "ACTION",
          action: { type: "notification", channel: "email", template: "weekly_pipeline_report" },
        },
      ],
    },
  ],
};

globalRegistry.register(RealEstateTemplate);
