/**
 * GET /api/chat/history?taskId=<id>  â†’ mensagens da conversa (task)
 * GET /api/chat/history?dealId=<id>  â†’ histÃ³rico do deal (compatibilidade)
 * [SEC-03] workspaceId validado via sessÃ£o.
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/session";
import { getChatHistory, getMessages } from "@/app/(portal)/chat/_lib/chat-queries";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taskId = req.nextUrl.searchParams.get("taskId");
  const dealId = req.nextUrl.searchParams.get("dealId");

  if (taskId) {
    const messages = await getMessages(taskId, workspaceId);
    return NextResponse.json(messages);
  }

  if (dealId) {
    const messages = await getChatHistory(workspaceId, dealId);
    return NextResponse.json(messages);
  }

  return NextResponse.json({ error: "taskId ou dealId obrigatÃ³rio" }, { status: 400 });
}
