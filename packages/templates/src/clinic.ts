import { z } from "zod";
import type { SectorTemplate } from "./engine";
import { globalRegistry } from "./engine";

export const ClinicMetaSchema = z.object({
  patientId: z.string(),
  procedure: z.string(),
  specialty: z.enum(["general", "cardiology", "dentistry", "orthopedics", "dermatology"]),
  healthPlan: z.string().optional(),
  healthPlanCode: z.string().optional(),
  appointmentDate: z.string().datetime().optional(),
  doctorId: z.string(),
  anamnesis: z.string().optional(),
  consentSigned: z.boolean().default(false),
});

export type ClinicMeta = z.infer<typeof ClinicMetaSchema>;

export const ClinicTemplate: SectorTemplate = {
  id: "clinic",
  name: "Clínica Médica",
  stages: [
    { name: "Lead",         color: "#8b5cf6", slaDays: 1 },
    { name: "Agendamento",  color: "#6366f1", slaDays: 2 },
    { name: "Confirmação",  color: "#3b82f6", slaDays: 1 },
    { name: "Consulta",     color: "#06b6d4", slaDays: 1 },
    { name: "Tratamento",   color: "#f59e0b", slaDays: 30 },
    { name: "Alta",         color: "#22c55e", isWon: true },
    { name: "Retorno",      color: "#10b981" },
    { name: "Cancelado",    color: "#ef4444", isLost: true },
  ],
  dealMetaSchema: ClinicMetaSchema,
  vocabulary: {
    deal: "Paciente",
    contact: "Responsável",
    stage: "Etapa",
    value: "Valor",
    agent: "Assistente IA",
    flow: "Protocolo",
  },
  agentPersona: {
    name: "Assistente Clínico IA",
    persona:
      "Você é o assistente de gestão da clínica. Cuida do agendamento, " +
      "follow-up de pacientes e protocolos de confirmação. " +
      "Seja empático, preciso e respeitoso com a privacidade do paciente (LGPD).",
    skills: ["deal.create", "deal.move", "task.create", "contact.upsert", "flow.trigger"],
  },
  defaultFlows: [
    {
      name: "Confirmação de Consulta",
      description: "24h antes → SMS/WhatsApp de confirmação",
      trigger: { type: "cron", config: { schedule: "0 10 * * *" } },
      steps: [
        {
          type: "ACTION",
          action: { type: "notification", channel: "whatsapp", template: "appointment_confirmation_24h" },
        },
      ],
    },
    {
      name: "Retorno Automático",
      description: "Após Alta → cria follow-up de retorno em 30 dias",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Alta" } },
      steps: [
        {
          type: "ACTION",
          action: {
            type: "task.create",
            title: "Agendar retorno do paciente",
            daysFromNow: 30,
            urgent: false,
            important: true,
          },
        },
      ],
    },
    {
      name: "NPS Pós-consulta",
      description: "2 dias após Alta → pesquisa de satisfação",
      trigger: { type: "event", config: { event: "deal.stage.changed", toStage: "Alta", delayHours: 48 } },
      steps: [
        {
          type: "ACTION",
          action: { type: "notification", channel: "email", template: "patient_nps_survey" },
        },
      ],
    },
  ],
};

globalRegistry.register(ClinicTemplate);
