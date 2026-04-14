/**
 * Field Agent Follow-up Worker
 *
 * Agenda verificação 2h após contactar cada motoboy.
 * Se status ainda CONTACTED → marca NO_RESPONSE → tenta próximo agente.
 *
 * [SEC-03] workspaceId em todas as queries.
 * [SEC-06] AuditLog: FIELD_AGENT_NO_RESPONSE.
 */

import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { db } from "@flow-os/db";

// ── Constantes ─────────────────────────────────────────────────────────────

export const FIELD_AGENT_FOLLOWUP_QUEUE = "field-agent-followup";
const DEFAULT_DELAY_MS = 2 * 60 * 60 * 1000; // 2 horas

// ── Tipos ──────────────────────────────────────────────────────────────────

interface FollowupJobData {
  assignmentId: string;
  workspaceId: string;
  dealId: string;
}

// ── Audit helper ───────────────────────────────────────────────────────────

async function writeAudit(
  workspaceId: string,
  action: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): Promise<void> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!agent) return;

  await db.agentAuditLog.create({
    data: {
      workspaceId,
      agentId: agent.id,
      action,
      input: input as Record<string, string | number | boolean>,
      output: output as Record<string, string | number | boolean>,
      modelUsed: "none",
      tokensUsed: 0,
      costUsd: 0,
      durationMs: 0,
      success: true,
    },
  });
}

// ── Agendar follow-up ─────────────────────────────────────────────────────

let _queue: Queue | null = null;

function getQueue(connection: ConnectionOptions): Queue {
  if (!_queue) {
    _queue = new Queue(FIELD_AGENT_FOLLOWUP_QUEUE, { connection });
  }
  return _queue;
}

/**
 * Agenda verificação de resposta do motoboy após delayMs (default 2h).
 * Chamado pelo dispatcher ao enviar Msg 1.
 */
export async function scheduleFollowup(
  data: FollowupJobData,
  connection: ConnectionOptions,
  delayMs = DEFAULT_DELAY_MS,
): Promise<void> {
  const queue = getQueue(connection);
  await queue.add("check-response", data, {
    delay: delayMs,
    jobId: `followup-${data.assignmentId}`,
    removeOnComplete: true,
    removeOnFail: 50,
  });
}

/**
 * Cancela follow-up quando motoboy responde (aceite ou rejeição).
 * Chamado pela captura de evidências no webhook Evolution.
 */
export async function cancelFollowup(
  assignmentId: string,
  connection: ConnectionOptions,
): Promise<void> {
  const queue = getQueue(connection);
  const job = await queue.getJob(`followup-${assignmentId}`);
  if (job) {
    await job.remove().catch(() => undefined);
  }
}

// ── Processar follow-up ───────────────────────────────────────────────────

async function processFollowup(data: FollowupJobData): Promise<void> {
  const { assignmentId, workspaceId, dealId } = data;

  // Buscar assignment atual [SEC-03]
  const assignment = await db.fieldAssignment.findFirst({
    where: { id: assignmentId, workspaceId },
    select: {
      id: true,
      status: true,
      agentId: true,
      dealId: true,
      workspaceId: true,
      agent: { select: { partner: { select: { name: true } } } },
    },
  });

  if (!assignment) return;

  // Se já respondeu (ACCEPTED, IN_PROGRESS, COMPLETED, REJECTED), nada a fazer
  if (assignment.status !== "CONTACTED") return;

  // Verificar config do workflow para autoRetry
  const { resolveWorkflow } = await import("./field-workflow-resolver");
  const workflow = await resolveWorkflow(workspaceId);

  // Marcar como NO_RESPONSE
  await db.fieldAssignment.update({
    where: { id: assignmentId, workspaceId },
    data: { status: "NO_RESPONSE" },
  });

  // [SEC-06] AuditLog
  await writeAudit(workspaceId, "FIELD_AGENT_NO_RESPONSE", {
    assignmentId,
    agentId: assignment.agentId,
    agentName: assignment.agent.partner.name,
    dealId,
  }, {
    previousStatus: "CONTACTED",
    newStatus: "NO_RESPONSE",
  });

  // Verificar se ainda há assignments ativos para este Deal
  const activeCount = await db.fieldAssignment.count({
    where: {
      dealId,
      workspaceId,
      status: { in: ["CONTACTED", "ACCEPTED", "IN_PROGRESS"] },
    },
  });

  // Se nenhum ativo e autoRetry habilitado, tentar próximo agente disponível
  if (activeCount === 0 && workflow.config.autoRetry) {
    await dispatchNextAgent(dealId, workspaceId);
  }
}

// ── Despachar próximo agente não tentado ──────────────────────────────────

async function dispatchNextAgent(
  dealId: string,
  workspaceId: string,
): Promise<void> {
  // Buscar IDs de agentes já tentados neste Deal [SEC-03]
  const triedAssignments = await db.fieldAssignment.findMany({
    where: { dealId, workspaceId },
    select: { agentId: true },
  });
  const triedAgentIds = triedAssignments.map((a) => a.agentId);

  // Buscar Deal para extrair cidade/UF do meta [SEC-03]
  const deal = await db.deal.findFirst({
    where: { id: dealId, workspaceId },
    select: { meta: true },
  });
  if (!deal) return;

  const meta = (deal.meta ?? {}) as Record<string, unknown>;
  const cidade = (meta["imovelCidade"] ?? meta["cidade"] ?? "") as string;
  const uf = (meta["imovelUF"] ?? meta["uf"] ?? "") as string;

  if (!uf) return;

  // Buscar próximo agente disponível, excluindo os já tentados
  const nextAgent = await db.fieldAgentProfile.findFirst({
    where: {
      workspaceId,
      availability: "AVAILABLE",
      id: { notIn: triedAgentIds },
      OR: [
        { cities: { has: cidade } },
        { states: { has: uf } },
      ],
    },
    orderBy: [
      { avgRating: { sort: "desc", nulls: "last" } },
      { pricePerVisit: "asc" },
    ],
    include: { partner: { select: { id: true, name: true, phone: true } } },
  });

  if (!nextAgent || !nextAgent.partner.phone) {
    // Nenhum agente disponível — registrar no audit
    await writeAudit(workspaceId, "FIELD_AGENT_POOL_EXHAUSTED", {
      dealId,
      triedCount: triedAgentIds.length,
    }, {
      cidade,
      uf,
    });
    return;
  }

  // Despachar via lazy imports
  const { evolutionApi } = await import("../providers/evolution-api");
  const { resolveWorkflow } = await import("./field-workflow-resolver");
  const { buildMessageFromTemplate } = await import("./field-agent-defaults");

  // Resolver workflow para template
  const workflow = await resolveWorkflow(workspaceId);
  const { resolveMissionProfileForDeal, priceAgreedFromProfile, effectiveFollowupMs } = await import(
    "./mission-profile-resolver"
  );
  const missionProfile = await resolveMissionProfileForDeal(workspaceId, meta);
  const agreed = priceAgreedFromProfile(Number(nextAgent.pricePerVisit), missionProfile);

  // Resolver instância Evolution
  const integration = await db.workspaceIntegration.findFirst({
    where: { workspaceId, type: "WHATSAPP_EVOLUTION", status: "ACTIVE" },
    select: { config: true },
  });
  const cfg = (integration?.config ?? {}) as Record<string, string>;
  const instance = cfg["EVOLUTION_INSTANCE_NAME"];
  if (!instance) return;

  // Criar assignment + enviar Msg 1 (via template do workflow)
  const assignment = await db.fieldAssignment.create({
    data: {
      workspaceId,
      dealId,
      agentId: nextAgent.id,
      profileId: missionProfile?.id ?? null,
      status: "PENDING_CONTACT",
      priceAgreed: agreed,
    },
  });

  const msg = buildMessageFromTemplate(
    workflow.templates["initial_contact"] ?? "",
    { nome: nextAgent.partner.name },
  );

  try {
    await evolutionApi.sendText(instance, nextAgent.partner.phone, msg, workspaceId);

    await db.fieldAssignment.update({
      where: { id: assignment.id },
      data: { status: "CONTACTED", contactedAt: new Date() },
    });

    await writeAudit(workspaceId, "FIELD_AGENT_CONTACTED", {
      dealId,
      agentId: nextAgent.id,
      agentName: nextAgent.partner.name,
      phoneSuffix: nextAgent.partner.phone.slice(-4),
      isRetry: true,
    }, {
      assignmentId: assignment.id,
      status: "CONTACTED",
    });

    // Agendar novo follow-up para este agente (delay do workflow)
    const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    await scheduleFollowup(
      { assignmentId: assignment.id, workspaceId, dealId },
      { url: redisUrl },
      effectiveFollowupMs(workflow.config.followupDelayMs, missionProfile),
    );
  } catch (err) {
    console.error("[field-agent-followup] Erro ao contactar próximo agente:", err);
  }
}

// ── Criar worker BullMQ ───────────────────────────────────────────────────

export function createFieldAgentFollowupWorker(
  connection: ConnectionOptions,
): Worker {
  return new Worker(
    FIELD_AGENT_FOLLOWUP_QUEUE,
    async (job) => {
      await processFollowup(job.data as FollowupJobData);
    },
    {
      connection,
      concurrency: 3,
    },
  );
}
