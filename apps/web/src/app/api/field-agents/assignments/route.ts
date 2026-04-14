/**
 * GET /api/field-agents/assignments — assignments paginados com filtros
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type AssignmentStatus, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "";
  const dealId = sp.get("dealId") ?? "";
  const agentId = sp.get("agentId") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? "50")));

  const where: Prisma.FieldAssignmentWhereInput = { workspaceId };
  if (status) {
    where.status = status as AssignmentStatus;
  }
  if (dealId) where.dealId = dealId;
  if (agentId) where.agentId = agentId;

  const [items, total] = await Promise.all([
    db.fieldAssignment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        deal: { select: { id: true, title: true } },
        agent: {
          include: {
            partner: { select: { id: true, name: true, phone: true } },
          },
        },
        _count: { select: { evidences: true } },
      },
    }),
    db.fieldAssignment.count({ where }),
  ]);

  const rows = items.map((a) => ({
    id: a.id,
    dealId: a.dealId,
    dealTitle: a.deal.title,
    agentId: a.agentId,
    agentName: a.agent.partner.name,
    agentPhone: a.agent.partner.phone,
    status: a.status,
    priceAgreed: a.priceAgreed ? Number(a.priceAgreed) : null,
    evidenceCount: a._count.evidences,
    contactedAt: a.contactedAt,
    acceptedAt: a.acceptedAt,
    completedAt: a.completedAt,
    createdAt: a.createdAt,
  }));

  return NextResponse.json({ items: rows, total, page, limit });
}
