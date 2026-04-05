export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { testEmailConnection } from "@flow-os/brain/providers/email-sender";
import { getSessionWorkspaceId } from "@/lib/session";

// GET /api/email-accounts/[id]/test — testa conexão IMAP
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // [SEC-03] Verificar que a conta pertence ao workspace da sessão
  const exists = await db.emailAccount.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = await testEmailConnection(id, workspaceId);

  return NextResponse.json({ ok, accountId: id });
}
