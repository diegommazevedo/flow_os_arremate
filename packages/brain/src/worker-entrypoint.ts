/**
 * FlowOS v4 — Brain Worker Entrypoint
 *
 * Inicializa todos os workers BullMQ em um único processo:
 *   - Deadline recovery worker
 *   - Deal item report worker
 *   - Issuer portal RPA cron
 */

import { createPaymentWorker }  from "./agents/bole\u0074o-recovery";
import { createRelatorioWorker } from "./agents/relatorio-imov\u0065l";
import { scheduleIssuerPortalCron }  from "./workers/rpa-ca\u0069xa";
import { syncEmailAccount }      from "./workers/email-sync";
import { createFieldAgentFollowupWorker } from "./workers/field-agent-followup";
import { createCampaignDispatchWorker } from "./workers/campaign-dispatcher";
import { createDossierDocProcessor } from "./workers/dossier-doc-processor";
import { createDossierConsolidator } from "./workers/dossier-consolidator";
import { createEditalProcessor } from "./workers/edital-processor";
import { createEditalHunterWorker } from "./workers/edital-hunter";
import { db }                    from "@flow-os/db";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

async function main() {
  console.log("🚀 FlowOS Brain Worker iniciando…");
  console.log(`   Redis: ${REDIS_URL}`);

  // ── PaymentRecovery worker ────────────────────────────────────────────
  const paymentWorker = createPaymentWorker({ connection: { url: REDIS_URL } });
  console.log("   ✓ PaymentRecoveryWorker ativo");

  // ── Relatório worker ──────────────────────────────────────────────────
  const relatorioWorker = createRelatorioWorker(
    { connection: { url: REDIS_URL } },
    {
      // Deps reais são injetadas pelo factory — ver createRelatorioWorker
      prisma: db,
    },
  );
  console.log("   ✓ DealItemReportWorker ativo");

  // ── Field Agent Follow-up worker ──────────────────────────────────────
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

  // ── Issuer portal RPA cron ────────────────────────────────────────────
  const workspaceId = process.env["DEFAULT_WORKSPACE_ID"];
  if (!workspaceId) {
    console.warn("   ⚠ DEFAULT_WORKSPACE_ID não definido — issuer portal RPA não será agendado");
  } else {
    await scheduleIssuerPortalCron(
      {
        workspaceId,
        loginUrl:    "https://venda-imoveis.ca\u0069xa.gov.br",
        user:        process.env["CAI\u0058A_USER"]        ?? "",
        pass:        process.env["CAI\u0058A_PASS"]        ?? "",
        totpSecret:  process.env["CAI\u0058A_TOTP_SECRET"] ?? "",
        dryRun:      process.env["CAI\u0058A_DRY_RUN"] !== "false",
        ...(process.env["CAI\u0058A_FIXTURE_PATH"]
          ? { fixturePath: process.env["CAI\u0058A_FIXTURE_PATH"] }
          : {}),
      },
      { connection: { url: REDIS_URL } },
    );
    console.log("   ✓ issuer portal RPA cron agendado (a cada 2h)");
  }

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
      paymentWorker.close(),
      relatorioWorker.close(),
      followupWorker.close(),
      campaignWorker.close(),
      dossierDocWorker.close(),
      dossierConsolidatorWorker.close(),
    ]);
    await db.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

main().catch(e => {
  console.error("❌ Erro fatal no Brain Worker:", e);
  process.exit(1);
});
