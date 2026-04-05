export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const integration = await db.workspaceIntegration.findFirst({
    where:  { id, workspaceId: session.workspaceId },
    select: { id: true, name: true, type: true },
  });
  if (!integration) return NextResponse.json({ error: "Integracao nao encontrada" }, { status: 404 });

  await db.workspaceIntegration.delete({ where: { id: integration.id } });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action:      "integration.whatsapp.delete",
    input:       { integrationId: id },
    output:      { name: integration.name, type: integration.type },
  });

  return NextResponse.json({ ok: true });
}
