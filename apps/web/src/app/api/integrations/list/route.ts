export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // [SEC-03] workspaceId da sessão — nunca do request
  // [SEC-02] config (secrets) nunca retorna ao frontend
  const integrations = await db.workspaceIntegration.findMany({
    where:  { workspaceId: session.workspaceId, status: "ACTIVE" },
    select: { id: true, name: true, type: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ integrations });
}
