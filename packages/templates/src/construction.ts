import { z } from "zod";
import type { SectorTemplate } from "./engine";
import { globalRegistry } from "./engine";

export const ConstructionMetaSchema = z.object({
  projectType: z.enum(["residential", "commercial", "infrastructure", "renovation", "industrial"]),
  address: z.object({ cep: z.string(), city: z.string(), state: z.string() }),
  area: z.number().positive(),
  estimatedValue: z.number().positive(),
  contractedValue: z.number().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  architect: z.string().optional(),
  engineerId: z.string().optional(),
  artNumber: z.string().optional(),
  permits: z.array(z.string()).default([]),
  percentComplete: z.number().min(0).max(100).default(0),
});

export type ConstructionMeta = z.infer<typeof ConstructionMetaSchema>;

export const ConstructionTemplate: SectorTemplate = {
  id: "construction",
  name: "Construtora",
  stages: [
    { name: "Prospecção",          color: "#8b5cf6", slaDays: 7 },
    { name: "Orçamento",           color: "#6366f1", slaDays: 10 },
    { name: "Proposta",            color: "#3b82f6", slaDays: 7 },
    { name: "Contrato",            color: "#06b6d4", slaDays: 5 },
    { name: "Obra em andamento",   color: "#f59e0b", slaDays: 180 },
    { name: "Vistoria",            color: "#f97316", slaDays: 7 },
    { name: "Entrega",             color: "#22c55e", isWon: true },
    { name: "Pós-obra",            color: "#10b981" },
    { name: "Cancelado",           color: "#ef4444", isLost: true },
  ],
  dealMetaSchema: ConstructionMetaSchema,
  vocabulary: {
    deal: "Obra",
    contact: "Cliente",
    stage: "Fase",
    value: "Valor Contratado",
    agent: "Gestor IA",
    flow: "Processo",
  },
  agentPersona: {
    name: "Gestor de Obras IA",
    persona:
      "Você é o gestor IA da construtora. Monitora andamento de obras, " +
      "controla prazos, emite alertas de marcos e gerencia documentação técnica " +
      "(ART, alvarás, vistorias). Seja técnico, objetivo e focado em cronograma.",
    skills: ["deal.create", "deal.move", "task.create", "contact.upsert", "flow.trigger", "analytics.query"],
  },
  defaultFlows: [
    {
      name: "Alerta de Marco de Obra",
      description: "A cada 25% de progresso → alerta para vistoria técnica",
      trigger: { type: "event", config: { event: "deal.meta.updated", field: "percentComplete" } },
      steps: [
        {
          type: "CONDITION",
          action: {},
          // condition: percentComplete em 25, 50, 75, 100
        },
        {
          type: "ACTION",
          action: { type: "task.create", title: "Vistoria técnica de marco", urgent: true, important: true },
        },
      ],
    },
    {
      name: "Checklist de Entrega",
      description: "30 dias antes da entrega → cria checklist de finalização",
      trigger: { type: "event", config: { event: "deal.endDate.approaching", daysBefore: 30 } },
      steps: [
        {
          type: "ACTION",
          action: {
            type: "task.create_batch",
            tasks: [
              { title: "Vistoria elétrica", urgent: false, important: true },
              { title: "Vistoria hidráulica", urgent: false, important: true },
              { title: "Limpeza pós-obra", urgent: false, important: true },
              { title: "Documentação de entrega", urgent: false, important: true },
              { title: "Manual do proprietário", urgent: false, important: true },
            ],
          },
        },
      ],
    },
    {
      name: "Medição Mensal",
      description: "Todo dia 25 → solicita medição ao engenheiro responsável",
      trigger: { type: "cron", config: { schedule: "0 8 25 * *" } },
      steps: [
        {
          type: "ACTION",
          action: { type: "task.create", title: "Submeter medição mensal ao cliente", urgent: true, important: true },
        },
      ],
    },
  ],
};

globalRegistry.register(ConstructionTemplate);
