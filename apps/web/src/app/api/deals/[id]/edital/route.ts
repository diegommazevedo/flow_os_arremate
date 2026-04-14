/**
 * GET /api/deals/[id]/edital — status do edital do deal
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: dealId } = await params;

  const edital = await db.edital.findFirst({
    where: { dealId, workspaceId },
  });

  return NextResponse.json({ edital: edital ?? null });
}
