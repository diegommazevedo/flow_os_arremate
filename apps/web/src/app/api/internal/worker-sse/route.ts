/**
 * POST — workers (Brain) notificam o sse-bus do Next.js.
 * [SEC-02] Segredo partilhado FLOWOS_WORKER_SSE_SECRET (nunca expor ao browser).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { publishKanbanEvent, type KanbanSSEEvent } from "@/lib/sse-bus";

export async function POST(req: NextRequest) {
  const secret = process.env["FLOWOS_WORKER_SSE_SECRET"];
  if (!secret) {
    return NextResponse.json({ error: "FLOWOS_WORKER_SSE_SECRET não configurado" }, { status: 503 });
  }
  if (req.headers.get("x-flowos-worker-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Partial<KanbanSSEEvent> | null;
  if (!body?.type) {
    return NextResponse.json({ error: "type obrigatório" }, { status: 400 });
  }

  const event: KanbanSSEEvent = {
    type: body.type as KanbanSSEEvent["type"],
    dealId: body.dealId ?? null,
    timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
    ...(body.taskId !== undefined && body.taskId !== ""
      ? { taskId: body.taskId }
      : {}),
    ...(body.quadrant !== undefined ? { quadrant: body.quadrant } : {}),
    ...(body.channel !== undefined ? { channel: body.channel } : {}),
    ...(body.patch !== undefined ? { patch: body.patch } : {}),
  };

  publishKanbanEvent(event);
  return NextResponse.json({ ok: true });
}
