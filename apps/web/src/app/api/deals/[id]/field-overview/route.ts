/**
 * GET — FieldAssignment + evidências + PaymentOrder por deal (SEC-03).
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

  const assignments = await db.fieldAssignment.findMany({
    where: { workspaceId, dealId },
    orderBy: { createdAt: "desc" },
    include: {
      agent: { include: { partner: { select: { name: true, phone: true } } } },
      evidences: { orderBy: { capturedAt: "asc" } },
      paymentOrder: true,
    },
  });

  return NextResponse.json({ assignments });
}
