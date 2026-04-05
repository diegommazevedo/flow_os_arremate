export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog, getScopedTask } from "@/lib/chatguru-api";
import { publishKanbanEvent } from "@/lib/sse-bus";

const Schema = z.object({
  status: z.enum(["ABERTO", "EM_ATENDIMENTO", "AGUARDANDO", "RESOLVIDO", "FECHADO", "INDEFINIDO"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { taskId } = await params;
  const task = await getScopedTask(session.workspaceId, taskId);
  if (!task) return NextResponse.json({ error: "Task nao encontrada" }, { status: 404 });

  const chatSession = await db.chatSession.upsert({
    where: { taskId },
    create: {
      workspaceId: session.workspaceId,
      taskId,
      status: parsed.data.status,
    },
    update: {
      status: parsed.data.status,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.session.status.update",
    input: { taskId, status: parsed.data.status },
    output: { chatSessionId: chatSession.id, dealId: task.dealId ?? null },
  });

  publishKanbanEvent({
    type: "TASK_UPDATED",
    taskId,
    dealId: task.dealId ?? null,
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true, chatSession });
}
