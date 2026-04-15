import {
  enqueueCampaignDispatchJobs,
  type CampaignDispatchJobData,
} from "@flow-os/brain/workers/campaign-dispatcher";

export type CampaignEnqueueJob = CampaignDispatchJobData & { delayMs: number };

/**
 * Enfileira jobs na fila BullMQ. Falhas de Redis/rede não devem derrubar a rota
 * com 502 — devolvem ok: false para a API responder 503.
 */
export async function tryEnqueueCampaignDispatchJobs(
  redisUrl: string,
  jobs: CampaignEnqueueJob[],
  logLabel: string,
): Promise<{ ok: true } | { ok: false }> {
  try {
    await enqueueCampaignDispatchJobs(redisUrl, jobs);
    return { ok: true };
  } catch (err) {
    console.error(`[${logLabel}] fila BullMQ / Redis indisponível`, err);
    return { ok: false };
  }
}
