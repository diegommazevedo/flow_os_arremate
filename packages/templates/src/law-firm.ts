import { z } from "zod";
import type { SectorTemplate } from "./engine";
import { globalRegistry } from "./engine";

export const LawFirmMetaSchema = z.object({
  processNumber: z.string().optional(),
  court: z.string().optional(),
  subject: z.string(),
  area: z.enum(["civil", "criminal", "labor", "tax", "consumer", "family", "corporate"]),
  clientRole: z.enum(["plaintiff", "defendant", "accused", "other"]),
  opposingParty: z.string().optional(),
  hearingDate: z.string().datetime().optional(),
  deadlines: z.array(z.object({
    description: z.string(),
    dueDate: z.string().datetime(),
  })).default([]),
  successFee: z.number().optional(),
  retainerFee: z.number().optional(),
  confidential: z.boolean().default(true),
});

export type LawFirmMeta = z.infer<typeof LawFirmMetaSchema>;

export const LawFirmTemplate: SectorTemplate = {
  id: "law-firm",
  name: "Escritório de Advocacia",
  stages: [
    { name: "Consulta",        color: "#8b5cf6", slaDays: 2 },
    { name: "Contrato",        color: "#6366f1", slaDays: 5 },
    { name: "Inicial",         color: "#3b82f6", slaDays: 10 },
    { name: "Em andamento",    color: "#06b6d4", slaDays: 60 },
    { name: "Audiência",       color: "#f59e0b", slaDays: 7 },
    { name: "Recurso",         color: "#ef4444", slaDays: 15 },
    { name: "Encerrado",       color: "#22c55e", isWon: true },
    { name: "Arquivado",       color: "#6b7280", isLost: true },
  ],
  dealMetaSchema: LawFirmMetaSchema,
  vocabulary: {
    deal: "Processo",
    contact: "Cliente",
    stage: "Fase",
    value: "Honorários",
    agent: "Paralegal IA",
    flow: "Rito",
  },
  agentPersona: {
    name: "Paralegal IA",
    persona:
      "Você é o paralegal IA do escritório. Gerencia prazos processuais, " +
      "prepara resumos de casos, monitora audiências e alerta sobre deadlines. " +
      "Seja preciso com datas e referências legais. Confidencialidade é absoluta.",
    skills: ["deal.create", "deal.move", "task.create", "contact.upsert", "flow.trigger", "analytics.query"],
  },
  defaultFlows: [
    {
      name: "Alerta de Prazo Processual",
      description: "5 dias antes de deadline → cria task Q1 para advogado",
      trigger: { type: "cron", config: { schedule: "0 8 * * 1-5" } },
      steps: [
        {
          type: "ACTION",
          action: {
            type: "task.create_from_deadline",
            daysBeforeDeadline: 5,
            quadrant: "Q1_DO",
            urgent: true,
            important: true,
          },
        },
      ],
    },
    {
      name: "Preparação de Audiência",
      description: "3 dias antes da audiência → Brain prepara resumo do caso",
      trigger: { type: "event", config: { event: "deal.hearing.approaching", daysBefore: 3 } },
      steps: [
        {
          type: "ACTION",
          action: { type: "agent_call", agentSkill: "analytics.query", metric: "case_summary" },
        },
        {
          type: "ACTION",
          action: { type: "task.create", title: "Revisar resumo do caso para audiência", urgent: true, important: true },
        },
      ],
    },
    {
      name: "Geração de Fatura",
      description: "Quando processo encerrado → gera fatura automática",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Encerrado" } },
      steps: [
        {
          type: "ACTION",
          action: { type: "invoice.generate", template: "law_firm_closing" },
        },
      ],
    },
  ],
};

globalRegistry.register(LawFirmTemplate);
