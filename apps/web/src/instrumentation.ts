/**
 * Next.js instrumentation — arranque opcional dos workers BullMQ no mesmo
 * processo do servidor (Railway: `ENABLE_WORKERS=true`).
 *
 * Para produção com carga alta, preferir serviço dedicado `pnpm --filter @flow-os/brain start`
 * (ver `packages/brain/Dockerfile`, build a partir da raiz do monorepo).
 */

let brainWorkersStarted = false;

export async function register() {
  // Edge runtime não suporta BullMQ / Prisma do brain
  if (process.env["NEXT_RUNTIME"] === "edge") return;
  if (process.env["ENABLE_WORKERS"] !== "true") return;
  if (brainWorkersStarted) return;
  brainWorkersStarted = true;

  const { startBrainWorkers } = await import("@flow-os/brain/worker-entrypoint");
  void startBrainWorkers().catch((err) => {
    console.error("[flowos] ENABLE_WORKERS: falha ao iniciar brain workers:", err);
  });
}
