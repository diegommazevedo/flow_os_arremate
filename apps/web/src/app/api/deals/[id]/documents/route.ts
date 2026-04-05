export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verificar que o deal pertence ao workspace
  const deal = await db.deal.findFirst({
    where:  { id, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!deal) return NextResponse.json({ error: "Deal nao encontrado" }, { status: 404 });

  const documents = await db.document.findMany({
    where:   { dealId: deal.id, workspaceId: session.workspaceId },
    select:  { id: true, name: true, url: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take:    100,
  });

  return NextResponse.json({ documents });
}
