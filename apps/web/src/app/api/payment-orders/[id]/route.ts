/**
 * GET / PATCH payment order (SEC-03, SEC-06).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type Prisma } from "@flow-os/db";
import { getSessionContext, getSessionWorkspaceId } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const order = await db.paymentOrder.findFirst({
    where: { id, workspaceId },
    include: { assignment: { include: { agent: { include: { partner: true } } } } },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getSessionContext();
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "approve" && action !== "cancel") {
    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }

  const existing = await db.paymentOrder.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "approve") {
    const updated = await db.paymentOrder.update({
      where: { id, workspaceId },
      data: {
        status: "APPROVED",
        approvedBy: ctx?.userId ?? null,
        approvedAt: new Date(),
      },
    });
    await appendAuditLog({
      workspaceId,
      action: "PAYMENT_ORDER_APPROVED",
      input: { orderId: id } as Prisma.InputJsonObject,
      output: { status: updated.status } as Prisma.InputJsonObject,
    }).catch(() => undefined);
    return NextResponse.json({ order: updated });
  }

  const updated = await db.paymentOrder.update({
    where: { id, workspaceId },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ order: updated });
}
