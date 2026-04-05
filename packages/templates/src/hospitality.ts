import { z } from "zod";
import type { SectorTemplate } from "./engine";
import { globalRegistry } from "./engine";

export const HospitalityMetaSchema = z.object({
  guestName: z.string(),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  roomType: z.enum(["single", "double", "suite", "family", "presidential"]),
  roomNumber: z.string().optional(),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0),
  origin: z.string().optional(),
  specialRequests: z.string().optional(),
  mealPlan: z.enum(["none", "breakfast", "half-board", "full-board", "all-inclusive"]).default("none"),
  totalNights: z.number().int().positive(),
  ratePerNight: z.number().positive(),
  loyaltyTier: z.enum(["none", "silver", "gold", "platinum"]).default("none"),
  checkinDone: z.boolean().default(false),
  npsScore: z.number().min(0).max(10).optional(),
});

export type HospitalityMeta = z.infer<typeof HospitalityMetaSchema>;

export const HospitalityTemplate: SectorTemplate = {
  id: "hospitality",
  name: "Hotelaria",
  stages: [
    { name: "Consulta",      color: "#8b5cf6", slaDays: 1 },
    { name: "Cotação",       color: "#6366f1", slaDays: 1 },
    { name: "Reserva",       color: "#3b82f6", slaDays: 1 },
    { name: "Check-in",      color: "#06b6d4" },
    { name: "Hospedado",     color: "#f59e0b" },
    { name: "Check-out",     color: "#10b981", isWon: true },
    { name: "Pós-estadia",   color: "#22c55e" },
    { name: "Cancelado",     color: "#ef4444", isLost: true },
  ],
  dealMetaSchema: HospitalityMetaSchema,
  vocabulary: {
    deal: "Reserva",
    contact: "Hóspede",
    stage: "Etapa",
    value: "Diária",
    agent: "Concierge IA",
    flow: "Processo",
  },
  agentPersona: {
    name: "Concierge IA",
    persona:
      "Você é o Concierge IA do hotel. Cuida da experiência do hóspede " +
      "desde a reserva até o pós-estadia. Conhece upgrades disponíveis, " +
      "preferências dos hóspedes fidelizados e protocolos de boas-vindas. " +
      "Seja caloroso, atencioso e proativo.",
    skills: ["deal.create", "deal.move", "task.create", "contact.upsert", "flow.trigger"],
  },
  defaultFlows: [
    {
      name: "Pré-chegada",
      description: "24h antes do check-in → email de boas-vindas",
      trigger: { type: "event", config: { event: "deal.checkin.approaching", hoursBefore: 24 } },
      steps: [
        {
          type: "ACTION",
          action: { type: "notification", channel: "email", template: "hotel_pre_arrival" },
        },
      ],
    },
    {
      name: "Oferta de Upgrade",
      description: "Se room premium disponível → agente oferece upgrade",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Check-in" } },
      steps: [
        {
          type: "CONDITION",
          action: {},
          // condition: roomUpgradeAvailable == true
        },
        {
          type: "ACTION",
          action: { type: "agent_call", agentSkill: "deal.offer_upgrade" },
        },
      ],
    },
    {
      name: "NPS Pós-estadia",
      description: "1 dia após check-out → pesquisa NPS",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Check-out", delayHours: 24 } },
      steps: [
        {
          type: "ACTION",
          action: { type: "notification", channel: "email", template: "hotel_nps_survey" },
        },
      ],
    },
    {
      name: "Programa de Fidelidade",
      description: "Após check-out → calcula e credita pontos",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Check-out" } },
      steps: [
        {
          type: "ACTION",
          action: { type: "loyalty.credit_points" },
        },
      ],
    },
  ],
};

globalRegistry.register(HospitalityTemplate);
