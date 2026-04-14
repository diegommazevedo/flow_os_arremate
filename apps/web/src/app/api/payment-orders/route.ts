/**
 * GET — payment orders do workspace (SEC-03).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type PaymentStatus, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "";
  const assignmentId = sp.get("assignmentId") ?? "";
  const agentId = sp.get("agentId") ?? "";

  const where: Prisma.PaymentOrderWhereInput = { workspaceId };
  if (status) where.status = status as PaymentStatus;
  if (assignmentId) where.assignmentId = assignmentId;
  if (agentId) where.agentId = agentId;

  const items = await db.paymentOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      assignment: {
        select: {
          id: true,
          dealId: true,
          agent: { include: { partner: { select: { name: true } } } },
        },
      },
    },
  });

  return NextResponse.json({ items });
}
