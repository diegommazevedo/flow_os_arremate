export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { getScopedTask } from "@/lib/chatguru-api";
import { getSessionHistorico } from "@/app/(portal)/chat/_lib/chat-queries";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const task = await getScopedTask(session.workspaceId, taskId);
  if (!task) return NextResponse.json({ error: "Task nao encontrada" }, { status: 404 });

  const historico = await getSessionHistorico(taskId, session.workspaceId);
  return NextResponse.json({ historico });
}
