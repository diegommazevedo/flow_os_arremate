export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await db.member.findMany({
    where:   { workspaceId: session.workspaceId },
    select:  { id: true, userId: true, role: true },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ members });
}
