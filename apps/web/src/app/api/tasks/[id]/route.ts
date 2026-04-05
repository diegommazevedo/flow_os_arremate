export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const completed = Boolean(body?.completed);

  const task = await db.task.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true },
  });

  if (!task) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const updated = await db.task.update({
    where: { id },
    data: { completedAt: completed ? new Date() : null },
    select: { id: true, completedAt: true },
  });

  return NextResponse.json({ ok: true, task: updated });
}
