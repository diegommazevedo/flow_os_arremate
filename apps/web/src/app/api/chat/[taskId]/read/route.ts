/**
 * POST /api/chat/[taskId]/read
 * Zera o unreadCount da ChatSession ao abrir a conversa.
 * [SEC-03] workspaceId validado via sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;

  await db.chatSession.updateMany({
    where: { taskId, workspaceId },
    data: { unreadCount: 0 },
  });

  return NextResponse.json({ ok: true });
}
