export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog, getScopedTask } from "@/lib/chatguru-api";

const Schema = z.object({
  conteudo: z.string().min(1).max(4000),
  pinned: z.boolean().optional(),
  visivelNoBot: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const task = await getScopedTask(session.workspaceId, taskId);
  if (!task) return NextResponse.json({ error: "Task nao encontrada" }, { status: 404 });

  const notas = await db.chatNote.findMany({
    where: { workspaceId: session.workspaceId, taskId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ notas });
}

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

  await db.chatSession.upsert({
    where: { taskId },
    create: {
      workspaceId: session.workspaceId,
      taskId,
    },
    update: {},
  });

  const conteudo = defaultSanitizer.clean(parsed.data.conteudo);
  const nota = await db.chatNote.create({
    data: {
      workspaceId: session.workspaceId,
      taskId,
      conteudo,
      autorId: session.userId ?? "dev",
      pinned: parsed.data.pinned ?? false,
      visivelNoBot: parsed.data.visivelNoBot ?? false,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.note.create",
    input: {
      taskId,
      conteudo,
      pinned: parsed.data.pinned ?? false,
      visivelNoBot: parsed.data.visivelNoBot ?? false,
    },
    output: { noteId: nota.id, dealId: task.dealId ?? null },
  });

  return NextResponse.json({ ok: true, nota }, { status: 201 });
}
