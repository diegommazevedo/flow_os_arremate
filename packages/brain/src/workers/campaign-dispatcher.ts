/**
 * Campaign dispatch worker — fila BullMQ `campaign-dispatch`.
 * Processa itens de campanha com rate limit escalonado no enqueue (delay por slot).
 *
 * [SEC-03] Todas as queries com workspaceId.
 * [SEC-06] AuditLog CAMPAIGN_ITEM_PROCESSED.
 */

import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { db } from "@flow-os/db";
import { dispatchFieldAgents } from "./field-agent-dispatcher";
import { evolutionApi } from "../providers/evolution-api";

export const CAMPAIGN_DISPATCH_QUEUE = "campaign-dispatch";

export interface CampaignDispatchJobData {
  campaignItemId: string;
  campaignId: string;
  workspaceId: string;
}

function staggerDelayMs(index: number, ratePerHour: number): number {
  if (ratePerHour <= 1) return index * 60_000;
  const slotMs = Math.floor(3_600_000 / ratePerHour);
  const hour = Math.floor(index / ratePerHour);
  const slot = index % ratePerHour;
  return hour * 3_600_000 + slot * slotMs;
}

export async function enqueueCampaignDispatchJobs(
  redisUrl: string,
  jobs: Array<CampaignDispatchJobData & { delayMs: number }>,
): Promise<void> {
  const queue = new Queue(CAMPAIGN_DISPATCH_QUEUE, { connection: { url: redisUrl } });
  try {
    for (const j of jobs) {
      await queue.add(
        "dispatch",
        { campaignItemId: j.campaignItemId, campaignId: j.campaignId, workspaceId: j.workspaceId },
        {
          delay: j.delayMs,
          jobId: `ci-${j.campaignItemId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  } finally {
    await queue.close();
  }
}

/** Usado pela API ao criar campanha: calcula delays por índice. */
export function computeJobDelays(ratePerHour: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => staggerDelayMs(i, Math.max(1, ratePerHour)));
}

async function resolveEvolutionInstanceName(workspaceId: string): Promise<string | null> {
  const integration = await db.workspaceIntegration.findFirst({
    where: { workspaceId, type: "WHATSAPP_EVOLUTION", status: "ACTIVE" },
    select: { config: true },
  });
  if (!integration?.config) return null;
  const cfg = integration.config as Record<string, string>;
  return cfg["EVOLUTION_INSTANCE_NAME"] ?? cfg["instanceName"] ?? null;
}

async function writeAudit(
  workspaceId: string,
  action: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  success: boolean,
  error?: string,
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
      success,
      ...(error ? { error } : {}),
    },
  });
}

async function processJob(data: CampaignDispatchJobData): Promise<void> {
  const { campaignItemId, campaignId, workspaceId } = data;

  const item = await db.campaignItem.findFirst({
    where: { id: campaignItemId, workspaceId, campaignId },
    include: {
      campaign: true,
      contact: { select: { id: true, name: true, phone: true } },
      deal: { select: { id: true } },
    },
  });

  if (!item) return;
  if (item.status === "DONE" || item.status === "SKIPPED") return;
  if (item.campaign.status !== "RUNNING") return;

  await db.campaignItem.update({
    where: { id: campaignItemId, workspaceId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  await db.campaign.update({
    where: { id: campaignId, workspaceId },
    data: { sentCount: { increment: 1 } },
  });

  const type = item.campaign.type;
  const meta = (item.campaign.meta ?? {}) as Record<string, unknown>;

  try {
    if (type === "DOSSIER") {
      const dealId = item.dealId;
      if (!dealId) {
        throw new Error("Item sem dealId — associe um negócio ao lead");
      }
      const result = await dispatchFieldAgents(dealId, workspaceId);
      if (result.agentsContacted === 0) {
        throw new Error(result.errors.join("; ") || "Nenhum motoboy contactado");
      }
      const warn = result.errors.length ? result.errors.join("; ").slice(0, 500) : null;
      await db.campaignItem.update({
        where: { id: campaignItemId, workspaceId },
        data: { status: "DONE", completedAt: new Date(), error: warn },
      });
    } else if (type === "WA_MESSAGE") {
      const text = String(meta["waMessage"] ?? "").trim();
      if (!text) throw new Error("Campanha sem waMessage em meta");
      const phone = item.contact.phone?.replace(/\D/g, "") ?? "";
      if (phone.length < 10) throw new Error("Lead sem telefone válido");
      const instance = await resolveEvolutionInstanceName(workspaceId);
      if (!instance) throw new Error("Evolution não configurada");
      await evolutionApi.sendText(instance, phone, text, workspaceId);
      await db.campaignItem.update({
        where: { id: campaignItemId, workspaceId },
        data: { status: "DONE", completedAt: new Date(), error: null },
      });
    } else {
      await db.campaignItem.update({
        where: { id: campaignItemId, workspaceId },
        data: { status: "SKIPPED", completedAt: new Date(), error: "WA_TEMPLATE ainda não implementado" },
      });
      await writeAudit(
        workspaceId,
        "CAMPAIGN_ITEM_PROCESSED",
        { campaignItemId, campaignId, type },
        { status: "SKIPPED" },
        true,
      );
      return;
    }

    await db.campaign.update({
      where: { id: campaignId, workspaceId },
      data: { doneCount: { increment: 1 } },
    });

    await writeAudit(
      workspaceId,
      "CAMPAIGN_ITEM_PROCESSED",
      { campaignItemId, campaignId, type },
      { status: "DONE" },
      true,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    await db.campaignItem.update({
      where: { id: campaignItemId, workspaceId },
      data: { status: "ERROR", completedAt: new Date(), error: msg.slice(0, 500) },
    });
    await writeAudit(
      workspaceId,
      "CAMPAIGN_ITEM_PROCESSED",
      { campaignItemId, campaignId, type },
      { status: "ERROR" },
      false,
      msg,
    );
  }
}

export function createCampaignDispatchWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    CAMPAIGN_DISPATCH_QUEUE,
    async (job) => {
      await processJob(job.data as CampaignDispatchJobData);
    },
    { connection, concurrency: 5 },
  );
}
