/**
 * Fila `dossier-consolidator` — apenas enqueue (BullMQ), sem Playwright/PDF.
 * Rotas Next.js importam este módulo para não puxar `playwright-core` no bundle.
 */

import { Queue, type ConnectionOptions } from "bullmq";

export const DOSSIER_CONSOLIDATOR_QUEUE = "dossier-consolidator";

export interface ConsolidateJobData {
  dossierId: string;
  workspaceId: string;
  force?: boolean;
}

export async function enqueueDossierConsolidation(
  data: ConsolidateJobData,
  connection: ConnectionOptions,
): Promise<void> {
  const q = new Queue(DOSSIER_CONSOLIDATOR_QUEUE, { connection });
  await q.add("run", data, { removeOnComplete: true, removeOnFail: 50 });
  await q.close();
}
