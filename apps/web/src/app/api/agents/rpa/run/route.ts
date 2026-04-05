export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

export async function POST() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Disparo manual do RPA via BullMQ (importação dinâmica para não puxar Playwright no bundle web)
  try {
    const { Queue } = await import("bullmq");
    const connection = {
      host: process.env["REDIS_HOST"] ?? "localhost",
      port: Number(process.env["REDIS_PORT"] ?? 6379),
    };
    const queue = new Queue("rpa-external", { connection });
    const job = await queue.add(
      "rpa-run-manual",
      { workspaceId: session.workspaceId, triggeredBy: session.userId ?? "system", dryRun: false },
      { removeOnComplete: true, removeOnFail: 50 },
    );
    await queue.close();

    await appendAuditLog({
      workspaceId: session.workspaceId,
      action:      "agent.rpa.run_manual",
      input:       { triggeredBy: session.userId ?? "system" },
      output:      { jobId: job.id ?? "queued" },
    });

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e) {
    // Redis indisponível — retorna aviso mas não quebra
    const msg = e instanceof Error ? e.message : "Erro ao enfileirar job";
    return NextResponse.json({ ok: false, error: msg, hint: "Verifique se o Redis está ativo" }, { status: 503 });
  }
}
