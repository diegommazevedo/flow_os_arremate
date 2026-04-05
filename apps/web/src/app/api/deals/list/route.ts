export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db }                        from "@flow-os/db";
import { getSessionWorkspaceId }     from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const deals = await db.deal.findMany({
    where: {
      workspaceId,
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id:        true,
      title:     true,
      meta:      true,
      contact:   { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ deals });
}
