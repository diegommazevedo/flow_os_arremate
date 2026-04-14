/**
 * GET /api/dossiers — lista PropertyDossier com deal e contato.
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { DossierStatus, Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") as DossierStatus | null;
  const minScore = Number(sp.get("minScore") ?? "");
  const uf = (sp.get("uf") ?? "").trim().toUpperCase();

  const where: Prisma.PropertyDossierWhereInput = { workspaceId };
  if (status) {
    where.status = status;
  }
  if (!Number.isNaN(minScore) && minScore > 0) {
    where.fieldScore = { gte: minScore };
  }

  const rows = await db.propertyDossier.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      deal: {
        select: {
          id: true,
          meta: true,
          contact: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  let list = rows.map((d) => {
    const meta = (d.deal.meta ?? {}) as Record<string, unknown>;
    const cidade = String(meta["imovelCidade"] ?? meta["cidade"] ?? "—");
    const u = String(meta["imovelUF"] ?? meta["uf"] ?? "—").toUpperCase();
    const end = String(meta["imovelEndereco"] ?? meta["endereco"] ?? "—").slice(0, 56);
    return {
      id: d.id,
      dealId: d.dealId,
      leadName: d.deal.contact?.name ?? "—",
      imovel: end,
      cidade,
      uf: u,
      score: d.fieldScore ? Number(d.fieldScore) : null,
      riskScore: d.riskScore ? Number(d.riskScore) : null,
      status: d.status,
      reportUrl: d.reportUrl,
      sharedWithLead: d.sharedWithLead,
      contactId: d.deal.contact?.id ?? null,
    };
  });

  if (uf.length === 2) {
    list = list.filter((x) => x.uf === uf);
  }

  return NextResponse.json({ items: list });
}
