/**
 * Next.js instrumentation — arranque opcional dos workers BullMQ no mesmo
 * processo do servidor (Railway: `ENABLE_WORKERS=true`).
 *
 * Para produção com carga alta, preferir serviço dedicado `pnpm --filter @flow-os/brain start`
 * (ver `packages/brain/Dockerfile`, build a partir da raiz do monorepo).
 */

let brainWorkersStarted = false;

export async function register() {
  // Edge: sem BullMQ / brain. Node: `NEXT_RUNTIME` pode ser `nodejs` ou vazio no build.
  if (process.env["NEXT_RUNTIME"] === "edge") return;
  if (process.env["ENABLE_WORKERS"] !== "true") return;
  if (brainWorkersStarted) return;
  brainWorkersStarted = true;

  // Não deixar o webpack analisar o grafo até Playwright (edital-hunter, etc.).
  const { startBrainWorkers } = await import(
    /* webpackIgnore: true */
    "@flow-os/brain/worker-entrypoint"
  );
  try {
    // Aguardar para os logs do entrypoint (ex.: ✓ CampaignDispatchWorker) saírem
    // antes do Next marcar o servidor como pronto — ligação Redis do BullMQ ainda
    // pode completar em background logo a seguir.
    await startBrainWorkers();
  } catch (err) {
    console.error("[flowos] ENABLE_WORKERS: falha ao iniciar brain workers:", err);
  }
}
