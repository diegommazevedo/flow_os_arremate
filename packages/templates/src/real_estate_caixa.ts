import { z } from "zod";
import type { AgentPersona, FlowDefinition, SectorTemplate, StageConfig } from "./engine";
import { globalRegistry } from "./engine";

const PIPELINE_STAGE_COLORS = [
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

export const PIPELINE_STAGES = [
  { id: "triagem",             label: "Triagem",                         order: 1 },
  { id: "sem_acesso_grupo",    label: "Sem Acesso ao Grupo",             order: 2 },
  { id: "primeiro_contato",    label: "1º Contato c/ Cliente",           order: 3 },
  { id: "fgts_contratacao",    label: "FGTS Contratação",                order: 4 },
  { id: "itbi",                label: "ITBI",                            order: 5 },
  { id: "escritura",           label: "Escritura Pública Contratação",   order: 6 },
  { id: "registro",            label: "Registro de Imóveis",             order: 7 },
  { id: "troca_titularidade",  label: "Troca de Titularidade",           order: 8 },
  { id: "envio_docs_cef",      label: "Envio Docs para CEF",             order: 9 },
  { id: "docs_aguardando_cef", label: "Docs Enviados / Aguardando CEF",  order: 10 },
  { id: "emissao_nf",          label: "Emissão NF",                      order: 11 },
  { id: "processo_concluido",  label: "Processo Concluído",              order: 12 },
] as const;

export const COND_STATUS_VALUES = [
  "Iniciar",
  "Aguardando cliente",
  "Levantar Débitos e Docs.",
  "Emitir CND de Condomínio",
  "Encaminhado Para Pagamento",
  "Aguardando CG",
  "Aguardando Assinatura",
  "Aguardo Assinatura",
  "Aguardo link CG",
  "Aguardo andamento",
  "Aguardo Contrato",
  "Assinatura do contrato",
  "Levantar contato do condomínio",
  "Finalizado",
] as const;

export const ATIVIDADE_TIPOS = [
  "Troca de Titularidade",
  "Condomínio",
  "Registro",
  "ITBI",
  "Escritura",
  "IPTU",
  "FGTS",
  "Desocupação",
  "Leilões",
] as const;

/** ID do template no TokenRouter e rotas — default do workspace Caixa. */
export const REAL_ESTATE_CAIXA_TEMPLATE_ID = "real_estate_caixa" as const;

/** Classificador rápido do webhook Rocket.Chat (keywords, sem LLM). */
export const ROCKET_KEYWORD_RULES = {
  urgentKeywords: [
    "boleto",
    "vence",
    "vencendo",
    "urgente",
    "urgentíssimo",
    "prazo",
    "amanhã",
    "hoje",
    "pagar",
    "pagamento",
    "cancelar",
    "perder",
    "perdi",
    "socorro",
    "atrasado",
    "execução",
    "imediato",
    "bloqueado",
    "parado",
  ],
  delegateKeywords: [
    "dúvida",
    "pergunta",
    "como",
    "onde",
    "quando",
    "informação",
    "informar",
    "explicar",
    "consultar",
  ],
} as const;

const MODALIDADE_VALUES = [
  "Licitação Aberta",
  "Venda Online",
  "Venda Direta Online",
  "Venda Direta",
] as const;

const SUBTYPE_VALUES = ["FINANCIAMENTO", "A_VISTA", "LICITACAO_ABERTA"] as const;
const FORMA_PAGAMENTO_VALUES = ["À vista", "Financiamento", "FGTS", "Misto"] as const;
const BOLETO_STATUS_VALUES = ["PENDENTE", "PAGO", "VENCIDO", "AGUARDANDO"] as const;
const EXECUTOR_VALUES = ["Caixa", "Cliente", "Escritório"] as const;
const STATUS_PARALELO_VALUES = ["Não iniciado", "Em andamento", "Finalizado", "Pendente"] as const;

export type EtapaId = (typeof PIPELINE_STAGES)[number]["id"];
export type FaseId = EtapaId;
export type DealSubtype = (typeof SUBTYPE_VALUES)[number];
export type FaseStatus = (typeof STATUS_PARALELO_VALUES)[number];
export type AverbacaoStatus = (typeof STATUS_PARALELO_VALUES)[number];

const LeiloesSchema = z.object({
  responsavel: z.string().optional(),
  dataInicio: z.string().optional(),
  executor: z.enum(EXECUTOR_VALUES).optional(),
  statusCaixa: z.string().optional(),
  status: z.enum(STATUS_PARALELO_VALUES).optional(),
  protocolo: z.string().optional(),
  dataVencimentoProtocolo: z.string().optional(),
  dataTermino: z.string().optional(),
});

const TrocaTitularidadeSchema = z.object({
  responsavel: z.string().optional(),
  dataInicio: z.string().optional(),
  executor: z.enum(EXECUTOR_VALUES).optional(),
  status: z.enum(STATUS_PARALELO_VALUES).optional(),
  protocolo: z.string().optional(),
  dataTermino: z.string().optional(),
});

const CondominioSchema = z.object({
  responsavel: z.string().optional(),
  dataInicio: z.string().optional(),
  executor: z.enum(EXECUTOR_VALUES).optional(),
  possui: z.boolean().optional(),
  status: z.enum(COND_STATUS_VALUES).optional(),
  observacoes: z.string().optional(),
  responsavelPagamento: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  administradora: z.string().optional(),
  dataTermino: z.string().optional(),
});

const DesocupacaoSchema = z.object({
  responsavel: z.string().optional(),
  elegivel: z.boolean().optional(),
  clienteQuer: z.boolean().optional(),
  dataInicio: z.string().optional(),
  status: z.enum(STATUS_PARALELO_VALUES).optional(),
  dataTermino: z.string().optional(),
});

const ItbiSchema = z.object({
  status: z.string().optional(),
  responsavel: z.string().optional(),
  dataInicio: z.string().optional(),
  dataTermino: z.string().optional(),
  observacoes: z.string().optional(),
});

const RegistroSchema = z.object({
  status: z.string().optional(),
  responsavel: z.string().optional(),
  protocolo: z.string().optional(),
  cartorio: z.string().optional(),
  dataInicio: z.string().optional(),
  dataTermino: z.string().optional(),
  observacoes: z.string().optional(),
});

const IptuStatusSchema = z.object({
  status: z.string().optional(),
  responsavel: z.string().optional(),
  observacoes: z.string().optional(),
  dataTermino: z.string().optional(),
});

export const RealEstateCaixaMetaSchema = z.object({
  imovelId: z.string(),
  chb: z.string().optional(),
  endereco: z.string().optional(),
  uf: z.string().length(2).optional(),
  cidade: z.string().optional(),
  matricula: z.string().optional(),
  linkMatricula: z.string().url().optional(),
  valorAvaliacao: z.number().optional(),
  atendimentoRevisado: z.boolean().optional(),

  modalidade: z.enum(MODALIDADE_VALUES).optional(),
  subtype: z.enum(SUBTYPE_VALUES).optional(),
  tipoProduto: z.string().optional(),
  formaPagamento: z.enum(FORMA_PAGAMENTO_VALUES).optional(),
  formulario: z.string().optional(),
  valorArrematacao: z.number().optional(),
  valorFinanciado: z.number().optional(),
  valorFgts: z.number().optional(),
  valorProprios: z.number().optional(),
  valorBruto: z.number().optional(),
  dataPropostaVencedora: z.string().optional(),
  dataContratacao: z.string().optional(),
  dataVencimentoBoleto: z.string().optional(),
  dataAssinaturaEsperada: z.string().optional(),
  dataFechamentoEsperada: z.string().optional(),
  corretoraNome: z.string().optional(),
  creci: z.string().optional(),
  corretorNome: z.string().optional(),
  iptu: z.string().optional(),
  contrato: z.string().optional(),
  servico: z.string().optional(),

  paymentDeadline: z.string().optional(),
  boletoStatus: z.enum(BOLETO_STATUS_VALUES).optional(),

  currentPhase: z.string().optional(),
  kanbanStatus: z.string().optional(),
  eisenhower: z.string().optional(),
  stagnatedDays: z.number().optional(),
  criadoPorAutomacao: z.boolean().optional(),
  linkGrupoWhatsApp: z.string().optional(),

  leiloes: LeiloesSchema.optional(),
  trocaTitularidade: TrocaTitularidadeSchema.optional(),
  condominio: CondominioSchema.optional(),
  desocupacao: DesocupacaoSchema.optional(),
  itbi: ItbiSchema.optional(),
  registro: RegistroSchema.optional(),
  iptuStatus: IptuStatusSchema.optional(),

  pipedriveId: z.number().optional(),
  pipedriveOrigemId: z.string().optional(),
  proprietarioPipedrive: z.string().optional(),
  emailCcoEspecifico: z.string().optional(),
});

export type RealEstateCaixaMeta = z.infer<typeof RealEstateCaixaMetaSchema>;

export interface PhaseDefinition {
  id: EtapaId;
  name: string;
  description: string;
  order: number;
}

export const PHASE_DEFINITIONS: Record<EtapaId, PhaseDefinition> = Object.fromEntries(
  PIPELINE_STAGES.map((stage) => [
    stage.id,
    {
      id: stage.id,
      name: stage.label,
      description: `Etapa ${stage.order} do fluxo operacional do deal.`,
      order: stage.order,
    },
  ]),
) as Record<EtapaId, PhaseDefinition>;

export function getPhasesForSubtype(_subtype: DealSubtype): PhaseDefinition[] {
  return PIPELINE_STAGES.map((stage) => PHASE_DEFINITIONS[stage.id]);
}

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  requiredInPhase: EtapaId;
}

export const CHECKLIST_ARREMATANTE: ChecklistItem[] = [
  { id: "identidade", label: "Documento de identidade", required: true, requiredInPhase: "primeiro_contato" },
  { id: "comprovante_residencia", label: "Comprovante de residência", required: true, requiredInPhase: "primeiro_contato" },
  { id: "cpf", label: "CPF", required: true, requiredInPhase: "primeiro_contato" },
];

export const CHECKLIST_ARREMATING: ChecklistItem[] = [
  { id: "comprovante_fgts", label: "Comprovante FGTS", required: true, requiredInPhase: "fgts_contratacao" },
  { id: "guia_itbi", label: "Guia ITBI", required: true, requiredInPhase: "itbi" },
  { id: "comprovante_itbi", label: "Comprovante de pagamento do ITBI", required: true, requiredInPhase: "itbi" },
];

export interface EisenhowerRuleContext {
  paymentDeadline?: string | null;
  stagnatedDays?: number | null;
  condominioStatus?: string | null;
}

export interface EisenhowerQ1Rule {
  id: string;
  condition: string;
  message: string;
  evalFn: (ctx: EisenhowerRuleContext) => boolean;
}

export const EISENHOWER_Q1_RULES: EisenhowerQ1Rule[] = [
  {
    id: "payment_due_48h",
    condition: "paymentDeadline <= 48h",
    message: "Deal com vencimento de boleto nas próximas 48 horas.",
    evalFn: (ctx) => {
      if (!ctx.paymentDeadline) return false;
      const diff = new Date(ctx.paymentDeadline).getTime() - Date.now();
      return !Number.isNaN(diff) && diff <= 48 * 60 * 60 * 1000;
    },
  },
  {
    id: "condominio_stagnated",
    condition: "condominioStatus != Finalizado AND stagnatedDays > 7",
    message: "Condomínio estagnado acima do limite operacional.",
    evalFn: (ctx) =>
      ctx.condominioStatus !== "Finalizado" && Number(ctx.stagnatedDays ?? 0) > 7,
  },
];

export function evaluateEisenhowerRules(ctx: EisenhowerRuleContext): EisenhowerQ1Rule[] {
  return EISENHOWER_Q1_RULES.filter((rule) => rule.evalFn(ctx));
}

export interface UFSlaConfig {
  uf: string;
  itbiDays: number;
  registroDays: number;
}

export const DEFAULT_SLA: UFSlaConfig = {
  uf: "DEFAULT",
  itbiDays: 30,
  registroDays: 25,
};

export const UF_SLA_CONFIG: Partial<Record<string, UFSlaConfig>> = {
  GO: { uf: "GO", itbiDays: 30, registroDays: 20 },
  MG: { uf: "MG", itbiDays: 30, registroDays: 25 },
  SC: { uf: "SC", itbiDays: 20, registroDays: 20 },
  SP: { uf: "SP", itbiDays: 15, registroDays: 20 },
};

export function getUFSla(uf: string): UFSlaConfig {
  return UF_SLA_CONFIG[uf] ?? DEFAULT_SLA;
}

// MAPEAMENTO EXTERNO — adaptador UF → departamento (chaves genéricas)
export const UF_DEPARTMENT_MAP: Record<string, string> = {
  SP: "ATD_SUDESTE_SP",
  RJ: "ATD_SUDESTE_RJMG",
  MG: "ATD_SUDESTE_RJMG",
  RS: "ATD_SUL",
  SC: "ATD_SUL",
  PR: "ATD_SUL",
  GO: "ATD_CENTRO_OESTE",
  DF: "ATD_CENTRO_OESTE",
  MT: "ATD_CENTRO_OESTE",
  MS: "ATD_CENTRO_OESTE",
  BA: "ATD_NORDESTE",
  PE: "ATD_NORDESTE",
  CE: "ATD_NORDESTE",
  RN: "ATD_NORDESTE",
  AL: "ATD_NORDESTE",
  PA: "ATD_NORTE",
  AM: "ATD_NORTE",
};

export interface PortalConfig {
  allowDocumentUpload: boolean;
  showTimeline: boolean;
  showChat: boolean;
}

export const PORTAL_CONFIG: PortalConfig = {
  allowDocumentUpload: true,
  showTimeline: true,
  showChat: true,
};

// ─── Regras de classificação de email [P-01] ─────────────────────────────────
// Setor-specific — vive aqui em templates, nunca em packages/brain.

export const EMAIL_CLASSIFICATION_RULES = {
  q1Senders: ['caixa.gov.br', 'cef.gov.br'],
  q1Keywords: [
    'vencimento', 'prazo', 'urgente', 'imediato',
    'bloqueio', 'cancelamento', 'notificação', 'intimação',
    'ateste de pagamento', 'pagamento confirmado',
  ],
  q2Keywords: ['protocolo', 'registro', 'certidão', 'escritura'],
  chbPattern: /\b(\d{13})\b/,
  /** Chave em Deal.meta para localizar o deal pelo CHB [P-01] */
  dealMetaKey: 'imovelId',
} as const

export interface ExtendedLabels {
  deal: string;
  contact: string;
  stage: string;
  value: string;
  agent: string;
  flow: string;
}

export const EXTENDED_LABELS: ExtendedLabels = {
  deal: "Deal",
  contact: "Cliente",
  stage: "Etapa",
  value: "Valor",
  agent: "Assessor IA",
  flow: "Automação",
};

export interface RiskAlert {
  id: string;
  name: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface ContractRiskBotConfig {
  name: string;
  alerts: RiskAlert[];
}

export const CONTRACT_RISK_BOT: ContractRiskBotConfig = {
  name: "Rosalía",
  alerts: [
    {
      id: "condominio_stagnated",
      name: "Condomínio estagnado",
      severity: "high",
      message: "Há tratativas de condomínio acima de 7 dias sem atualização.",
    },
  ],
};

export const ETAPA_STAGES: StageConfig[] = PIPELINE_STAGES.map((stage, index) => ({
  name: stage.label,
  color: PIPELINE_STAGE_COLORS[index] ?? "#64748b",
  slaDays: index < 4 ? 7 : 15,
  ...(stage.id === "processo_concluido" ? { isWon: true } : {}),
}));

const DEFAULT_FLOWS: FlowDefinition[] = [
  {
    name: "Auto-triagem ao criar deal",
    description: "Define fase inicial, data estimada e time padrão ao criar um deal.",
    trigger: { id: "auto_triagem", type: "deal.created" },
    steps: [
      { type: "action", action: { action: "set_phase", value: "triagem" } },
      { type: "action", action: { action: "set_close_date", value: "+90d" } },
      { type: "action", action: { action: "assign_team", value: "default" } },
    ],
  },
  {
    name: "Nota automática Licitação Aberta",
    description: "Cria anotação padrão quando a modalidade for Licitação Aberta.",
    trigger: { id: "auto_nota_licitacao", type: "deal.created" },
    steps: [
      {
        type: "action",
        action: {
          condition: "meta.modalidade === 'Licitação Aberta'",
          action: "create_note",
          value: "Não é necessário elaborar o relatório. Modalidade dessa arrematação é Licitação Aberta.",
        },
      },
    ],
  },
  {
    name: "Alerta condomínio estagnado",
    description: "Cria atividade e notifica o responsável quando o condomínio fica parado por mais de 7 dias.",
    trigger: { id: "alert_cond_stagnated", type: "cron", schedule: "0 9 * * 1-5" },
    steps: [
      {
        type: "action",
        action: {
          condition: "meta.condominio.status !== 'Finalizado' AND stagnatedDays > 7",
          action: "create_task",
          value: "Condomínio - Atualizar tratativas",
        },
      },
      {
        type: "action",
        action: {
          condition: "meta.condominio.status !== 'Finalizado' AND stagnatedDays > 7",
          action: "notify_assignee",
          channel: "whatsapp",
        },
      },
    ],
  },
];

const AGENT_PERSONA: AgentPersona = {
  name: "Rosalía",
  persona:
    "Você opera deals imobiliários da Caixa com foco em disciplina de funil, cadência operacional, " +
    "tratativas de condomínio, registro, ITBI, escritura, FGTS e documentação CEF. " +
    "Seu papel é manter o deal atualizado e sem gargalos.",
  skills: [
    "deal.create",
    "deal.update_meta",
    "deal.move",
    "task.create",
    "task.complete",
    "note.create",
    "document.request",
    "flow.trigger",
  ],
};

export interface FlowTemplate extends SectorTemplate {
  pipelineStages: typeof PIPELINE_STAGES;
  phaseDefinitions: Record<EtapaId, PhaseDefinition>;
  getPhasesForSubtype: (subtype: DealSubtype) => PhaseDefinition[];
  condStatusValues: readonly string[];
  atividadeTipos: readonly string[];
  checklists: {
    arrematante: ChecklistItem[];
    arremating: ChecklistItem[];
  };
  eisenhowerQ1Rules: EisenhowerQ1Rule[];
  evaluateEisenhowerRules: (ctx: EisenhowerRuleContext) => EisenhowerQ1Rule[];
  ufSlaConfig: Partial<Record<string, UFSlaConfig>>;
  getUFSla: (uf: string) => UFSlaConfig;
  portalConfig: PortalConfig;
  extendedLabels: ExtendedLabels;
  contractRiskBot: ContractRiskBotConfig;
}

export const RealEstateCaixaTemplate: FlowTemplate = {
  id: "real_estate_caixa",
  name: "Arrematador Caixa",
  stages: ETAPA_STAGES,
  dealMetaSchema: RealEstateCaixaMetaSchema,
  defaultFlows: DEFAULT_FLOWS,
  agentPersona: AGENT_PERSONA,
  vocabulary: {
    deal: EXTENDED_LABELS.deal,
    contact: EXTENDED_LABELS.contact,
    stage: EXTENDED_LABELS.stage,
    value: EXTENDED_LABELS.value,
    agent: EXTENDED_LABELS.agent,
    flow: EXTENDED_LABELS.flow,
  },
  pipelineStages: PIPELINE_STAGES,
  phaseDefinitions: PHASE_DEFINITIONS,
  getPhasesForSubtype,
  condStatusValues: COND_STATUS_VALUES,
  atividadeTipos: ATIVIDADE_TIPOS,
  checklists: {
    arrematante: CHECKLIST_ARREMATANTE,
    arremating: CHECKLIST_ARREMATING,
  },
  eisenhowerQ1Rules: EISENHOWER_Q1_RULES,
  evaluateEisenhowerRules,
  ufSlaConfig: UF_SLA_CONFIG,
  getUFSla,
  portalConfig: PORTAL_CONFIG,
  extendedLabels: EXTENDED_LABELS,
  contractRiskBot: CONTRACT_RISK_BOT,
};

globalRegistry.register(RealEstateCaixaTemplate);
