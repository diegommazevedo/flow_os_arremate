/**
 * GET /api/field-agents/queue — stats da fila BullMQ field-agent-followup
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Importar BullMQ dinamicamente (evita erro se Redis não estiver disponível)
    const { Queue } = await import("bullmq");
    const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    const queue = new Queue("field-agent-followup", { connection: { url: redisUrl } });

    const counts = await queue.getJobCounts(
      "waiting", "active", "completed", "failed", "delayed",
    );

    // Buscar jobs com erro recentes
    const failedJobs = await queue.getFailed(0, 10);
    const failed = failedJobs.map((j) => ({
      id: j.id,
      data: j.data,
      failedReason: j.failedReason,
      attemptsMade: j.attemptsMade,
      finishedOn: j.finishedOn,
    }));

    // Buscar jobs agendados
    const delayedJobs = await queue.getDelayed(0, 10);
    const delayed = delayedJobs.map((j) => ({
      id: j.id,
      data: j.data,
      delay: j.opts?.delay ?? 0,
      processOn: j.processedOn,
    }));

    await queue.close();

    return NextResponse.json({
      counts,
      recentFailed: failed,
      scheduledJobs: delayed,
    });
  } catch (err) {
    return NextResponse.json({
      counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
      recentFailed: [],
      scheduledJobs: [],
      error: "Redis não disponível",
    });
  }
}
