/**
 * Fila `edital-hunter` — apenas enqueue (BullMQ), sem Playwright.
 * Rotas Next.js importam este módulo para não puxar `playwright-core` no bundle.
 */

import { Queue, type ConnectionOptions } from "bullmq";

export const EDITAL_HUNTER_QUEUE = "edital-hunter";

export interface HuntJobData {
  dealId: string;
  workspaceId: string;
}

export async function enqueueEditalHunt(data: HuntJobData, connection: ConnectionOptions): Promise<void> {
  const q = new Queue(EDITAL_HUNTER_QUEUE, { connection });
  await q.add("hunt", data, { removeOnComplete: true, removeOnFail: 20 });
  await q.close();
}
