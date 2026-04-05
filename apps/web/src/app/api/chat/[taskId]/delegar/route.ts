export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, TaskPriority } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog, getScopedTask } from "@/lib/chatguru-api";
import { publishKanbanEvent } from "@/lib/sse-bus";

const Schema = z.object({
  departamentoId: z.string().cuid(),
});

export async function POST(
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

  const department = await db.department.findFirst({
    where: { id: parsed.data.departamentoId, workspaceId: session.workspaceId },
    select: { id: true, nome: true },
  });
  if (!department) {
    return NextResponse.json({ error: "Departamento nao pertence ao workspace" }, { status: 403 });
  }

  const chatSession = await db.chatSession.upsert({
    where: { taskId },
    create: {
      workspaceId: session.workspaceId,
      taskId,
      departamentoId: department.id,
    },
    update: {
      departamentoId: department.id,
    },
  });

  const notificationTask = await db.task.create({
    data: {
      workspaceId: session.workspaceId,
      ...(task.dealId ? { dealId: task.dealId } : {}),
      title: defaultSanitizer.clean(`Delegado para ${department.nome}`),
      description: defaultSanitizer.clean(`Atendimento encaminhado para o departamento ${department.nome}.`),
      type: "Delegacao",
      priority: TaskPriority.MEDIUM,
      quadrant: "Q2_PLAN",
      urgent: false,
      important: true,
    },
    select: { id: true },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.session.delegate",
    input: { taskId, departamentoId: department.id },
    output: {
      chatSessionId: chatSession.id,
      notificationTaskId: notificationTask.id,
      dealId: task.dealId ?? null,
    },
  });

  publishKanbanEvent({
    type: "TASK_CREATED",
    taskId: notificationTask.id,
    dealId: task.dealId ?? null,
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true, chatSession, notificationTask }, { status: 201 });
}
