// Engine
export { TemplateEngine, TemplateRegistry, globalRegistry } from "./engine";
export type { SectorTemplate, StageConfig, UiVocabulary, FlowDefinition, AgentPersona } from "./engine";

// Templates — importar para registrar no globalRegistry
export { RealEstateTemplate, RealEstateMetaSchema, RealEstateStages } from "./real-estate";
export type { RealEstateMeta } from "./real-estate";

export {
  computeDueAt,
  defaultBrazilWeekendCalendar,
} from "./sla-due-at";
export type { ComputeDueAtInput, ComputeDueAtResult } from "./sla-due-at";

export {
  RealEstateCaixaTemplate,
  RealEstateCaixaMetaSchema,
  PIPELINE_STAGES,
  PIPELINE_MASTER_CONFIG,
  OWNER_GROUPS,
  ROLE_PIPELINE_MAP,
  EXCEPTION_TYPE_VALUES,
  EXCEPTION_TYPES,
  hasExclusiveSlaPolicy,
  COND_STATUS_VALUES,
  ATIVIDADE_TIPOS,
  PHASE_DEFINITIONS,
  ETAPA_STAGES,
  CHECKLIST_ARREMATANTE,
  CHECKLIST_ARREMATING,
  EISENHOWER_Q1_RULES,
  UF_SLA_CONFIG,
  DEFAULT_SLA,
  CONTRACT_RISK_BOT,
  PORTAL_CONFIG,
  EXTENDED_LABELS,
  getPhasesForSubtype,
  getUFSla,
  evaluateEisenhowerRules,
  UF_DEPARTMENT_MAP,
  EMAIL_CLASSIFICATION_RULES,
  REAL_ESTATE_CAIXA_TEMPLATE_ID,
  ROCKET_KEYWORD_RULES,
  MODALIDADE_VALUES,
  SUBTYPE_VALUES,
  SUBTYPE_TO_MODALIDADE,
} from "./real_estate_caixa";
export type {
  RealEstateCaixaMeta,
  FlowTemplate,
  FaseId,
  StageId,
  EtapaId,
  OwnerGroup,
  ExceptionType,
  PipelineMasterStage,
  PipelineMasterConfig,
  DealSubtype,
  FaseStatus,
  AverbacaoStatus,
  PhaseDefinition,
  ChecklistItem,
  EisenhowerQ1Rule,
  EisenhowerRuleContext,
  UFSlaConfig,
  PortalConfig,
  ExtendedLabels,
  ContractRiskBotConfig,
  RiskAlert,
} from "./real_estate_caixa";

export { ClinicTemplate, ClinicMetaSchema } from "./clinic";
export type { ClinicMeta } from "./clinic";

export { LawFirmTemplate, LawFirmMetaSchema } from "./law-firm";
export type { LawFirmMeta } from "./law-firm";

export { ConstructionTemplate, ConstructionMetaSchema } from "./construction";
export type { ConstructionMeta } from "./construction";

export { HospitalityTemplate, HospitalityMetaSchema } from "./hospitality";
export type { HospitalityMeta } from "./hospitality";
