export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { syncEmailAccount } from "@flow-os/brain/workers/email-sync";
import { getSessionWorkspaceId } from "@/lib/session";

// POST /api/email-accounts/[id]/sync — sync manual
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // [SEC-03] Verificar que a conta pertence ao workspace da sessão
  const account = await db.emailAccount.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await syncEmailAccount(id);

  return NextResponse.json({ ok: true });
}
