/**
 * GET /api/deals/[id]/mission-profile-suggestion — sugestão IA (não aplica).
 * [SEC-03]
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { suggestMissionProfile } from "@flow-os/brain/workers/mission-profile-advisor";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const deal = await db.deal.findFirst({
    where: { id, workspaceId },
    select: { meta: true },
  });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const suggestion = await suggestMissionProfile(workspaceId, (deal.meta ?? {}) as Record<string, unknown>);
  return NextResponse.json({ suggestion });
}
