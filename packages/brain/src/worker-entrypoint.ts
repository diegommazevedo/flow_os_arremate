/**
 * FlowOS v4 — Brain Worker Entrypoint
 *
 * Inicializa todos os workers BullMQ em um único processo:
 *   - Deadline recovery worker
 *   - Deal item report worker
 *   - Issuer portal RPA cron
 */

import { syncEmailAccount } from "./workers/email-sync";
import { createFieldAgentFollowupWorker } from "./workers/field-agent-followup";
import { createCampaignDispatchWorker } from "./workers/campaign-dispatcher";
import { createDossierDocProcessor } from "./workers/dossier-doc-processor";
import { createDossierConsolidator } from "./workers/dossier-consolidator";
import { createEditalProcessor } from "./workers/edital-processor";
import { createEditalHunterWorker } from "./workers/edital-hunter";
import { db } from "@flow-os/db";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

/** Inicia todos os workers BullMQ (usado pelo CLI e por `ENABLE_WORKERS` no Next). */
export async function startBrainWorkers(): Promise<void> {
  console.log("🚀 FlowOS Brain Worker iniciando…");
  console.log(`   Redis: ${REDIS_URL}`);

  const followupWorker = createFieldAgentFollowupWorker({ url: REDIS_URL });
  console.log("   ✓ FieldAgentFollowupWorker ativo");

  const campaignWorker = createCampaignDispatchWorker({ url: REDIS_URL });
  console.log("   ✓ CampaignDispatchWorker ativo");

  const dossierDocWorker = createDossierDocProcessor({ url: REDIS_URL });
  console.log("   ✓ DossierDocProcessor ativo");

  const dossierConsolidatorWorker = createDossierConsolidator({ url: REDIS_URL });
  console.log("   ✓ DossierConsolidator ativo");

  const editalProcessorWorker = createEditalProcessor({ url: REDIS_URL });
  console.log("   ✓ EditalProcessor ativo");

  const editalHunterWorker = createEditalHunterWorker({ url: REDIS_URL });
  console.log("   ✓ EditalHunter ativo");

  // ── Email sync — polling a cada 5 min ────────────────────────────────────
  const EMAIL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    const accounts = await db.emailAccount.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    for (const account of accounts) {
      await syncEmailAccount(account.id).catch(console.error);
    }
  }, EMAIL_SYNC_INTERVAL_MS);
  console.log(`   ✓ Email sync agendado (a cada ${EMAIL_SYNC_INTERVAL_MS / 60000} min)`);

  console.log("\n✅ Brain Worker pronto. Aguardando jobs…\n");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Encerrando workers…`);
    await Promise.allSettled([
      followupWorker.close(),
      campaignWorker.close(),
      dossierDocWorker.close(),
      dossierConsolidatorWorker.close(),
      editalProcessorWorker.close(),
      editalHunterWorker.close(),
    ]);
    await db.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

function isEntrypointCli(): boolean {
  const a = process.argv[1];
  if (!a) return false;
  return a.replace(/\\/g, "/").includes("worker-entrypoint");
}

if (isEntrypointCli()) {
  startBrainWorkers().catch((e) => {
    console.error("❌ Erro fatal no Brain Worker:", e);
    process.exit(1);
  });
}
