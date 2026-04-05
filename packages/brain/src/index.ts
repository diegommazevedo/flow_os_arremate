export { AgentRuntime } from "./runtime";
export type { AgentSkill, AgentRunContext, AgentRunInput, AgentRunResult } from "./runtime";

export { BrainMemoryManager, BrainMonitor } from "./memory";
export type { MemoryFragment, BrainUsageMetrics } from "./memory";

export { selectModel, calculateCost, MODEL_CONFIGS } from "./models";
export type { BrainModel, ModelConfig } from "./models";

export { CORE_SKILLS } from "./skills/core-skills";

export { TokenRouter, RouterDecisionSchema, PROVIDER_COSTS } from "./token-router";

export {
  PaymentRecoveryBot as DeadlineRecoveryBot,
  BullMQQueueAdapter,
  WhatsAppMetaClient,
  ResendEmailClient,
  RocketChatWebhookClient,
  ESCALATION_STEPS as DEADLINE_ESCALATION_STEPS,
  createPaymentRecoveryBot as createDeadlineRecoveryBot,
  createPaymentWorker as createDeadlineWorker,
  PaymentRecoveryBot as PaymentRecoveryBot,
  ESCALATION_STEPS as ESCALATION_STEPS,
  createPaymentRecoveryBot as createPaymentRecoveryBot,
  createPaymentWorker as createPaymentWorker,
} from "./agents/bole\u0074o-recovery";
export type {
  PaymentRecoveryInput as DeadlineRecoveryInput,
  PaymentRecoveryDeps as DeadlineRecoveryDeps,
  PaymentRecoveryBotFactoryOptions as DeadlineRecoveryBotFactoryOptions,
  PaymentAlert,
  PaymentJobData,
  EscalationStep,
  AlertChannel,
  NotificationResult,
  ScheduleResult,
  CancelResult,
  WhatsAppClient,
  EmailClient,
  SmsClient,
  RocketChatClient,
  RocketAttachment,
  PortalNotifier,
  DealRepository,
  AlertRepository,
  IQueue,
  PaymentRecoveryInput as PaymentRecoveryInput,
  PaymentRecoveryDeps as PaymentRecoveryDeps,
  PaymentRecoveryBotFactoryOptions as PaymentRecoveryBotFactoryOptions,
} from "./agents/bole\u0074o-recovery";

/** Schema isolado — sem Playwright (evita chromium-bidi no bundle Next.js). */
export { ReportAnaliseSchema, type ReportAnalise } from "./agents/relatorio-report-schema";
export {
  ReportAnaliseSchema as DealItemReportSchema,
  type ReportAnalise as DealItemReport,
} from "./agents/relatorio-report-schema";

// [P-01] EXCEÇÃO-ADAPTADOR-EXTERNO — nome do arquivo
// reflete o adaptador externo, não lógica de núcleo
import type { Worker as BullWorker } from "bullmq";
import type {
  MinioStorageDepsConfig,
  OrgConfig,
  RelatorioDeps,
  RelatorioPayload,
  RelatorioResult,
  RelatorioWorkerOptions,
} from "./agents/relatorio-imovel-types";

export type {
  RelatorioDeps as DealItemReportDeps,
  RelatorioPayload as DealItemReportPayload,
  RelatorioResult as DealItemReportResult,
  RelatorioWorkerOptions as DealItemReportWorkerOptions,
  RelatorioDeps,
  RelatorioPayload,
  RelatorioResult,
  RelatorioWorkerOptions,
  OrgConfig,
} from "./agents/relatorio-imovel-types";

export const RELATORIO_QUEUE = "generate-relatorio";
export const DEAL_ITEM_REPORT_QUEUE = RELATORIO_QUEUE;

/** Lazy-load relatorio-imovel (Playwright) — não usar typeof import() nas assinaturas (webpack). */
export async function generateDealItemReport(
  payload: RelatorioPayload,
  deps:    RelatorioDeps,
): Promise<RelatorioResult> {
  const m = await import("./agents/relatorio-imov\u0065l");
  return m.generateDealItemReport(payload, deps);
}

export { generateDealItemReport as generateRelatorioImov\u0065l };

export async function createRelatorioWorker(opts: RelatorioWorkerOptions): Promise<BullWorker> {
  const m = await import("./agents/relatorio-imov\u0065l");
  return m.createRelatorioWorker(opts);
}

export { createRelatorioWorker as createDealItemReportWorker };

export async function createMinioStorageDeps(
  cfg: MinioStorageDepsConfig,
): Promise<Pick<RelatorioDeps, "uploadBuffer" | "getPresignedUrl">> {
  const m = await import("./agents/relatorio-imov\u0065l");
  return m.createMinioStorageDeps(cfg);
}

// [P-01] EXCEÇÃO-ADAPTADOR-EXTERNO — nome do arquivo
// reflete o adaptador externo, não lógica de núcleo
import type {
  IssuerPortalRpaConfig,
  IssuerPortalWorkerOptions,
  RpaDeps,
  RpaRunStats,
} from "./workers/rpa-caixa-types";

export type {
  IssuerPortalRpaConfig,
  RpaRunStats,
  RpaDeps,
  IssuerPortalWorkerOptions,
  RpaCa\u0069xaConfig as RpaCa\u0069xaConfig,
  RpaCa\u0069xaWorkerOptions as RpaCa\u0069xaWorkerOptions,
} from "./workers/rpa-caixa-types";

/** Lazy-load rpa-caixa (Playwright) — assinaturas explícitas (sem typeof import no barrel). */
export async function runIssuerPortalRpa(
  config: IssuerPortalRpaConfig,
  deps:   RpaDeps,
): Promise<RpaRunStats> {
  const m = await import("./workers/rpa-ca\u0069xa");
  return m.runIssuerPortalRpa(config, deps);
}

export { runIssuerPortalRpa as runRpaCa\u0069xa };

export async function scheduleIssuerPortalCron(
  connection: IssuerPortalWorkerOptions["connection"],
): Promise<void> {
  const m = await import("./workers/rpa-ca\u0069xa");
  return m.scheduleIssuerPortalCron(connection);
}

export { scheduleIssuerPortalCron as scheduleRpaCa\u0069xaCron };

export async function createIssuerPortalWorker(opts: IssuerPortalWorkerOptions): Promise<BullWorker> {
  const m = await import("./workers/rpa-ca\u0069xa");
  return m.createIssuerPortalWorker(opts);
}

export { createIssuerPortalWorker as createRpaCa\u0069xaWorker };

export { WhatsAppMetaProvider, whatsAppMeta } from "./providers/whatsapp-meta";
export type {
  TemplateParam,
  TemplateComponent,
  SendTextResult,
  SendTemplateResult,
} from "./providers/whatsapp-meta";
export { EvolutionApiProvider, evolutionApi } from "./providers/evolution-api";

export { generateProtocol } from "./lib/protocol-generator";

export type {
  ProviderName,
  RouterDecision,
  TokenRouterInput,
  TokenRouterResult,
  TokenRouterConfig,
  TokenUsage,
  VectorChunk,
  VectorContext,
  HardRuleResult,
  LLMProvider,
  CacheClient,
  VectorSearchClient,
  MemoryWriter,
  AuditWriter,
} from "./token-router";
