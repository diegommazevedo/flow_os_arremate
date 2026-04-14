/**
 * GET /api/leads/count — conta leads que atendem filtros de segmentacao.
 * [SEC-03] workspaceId da sessao.
 * Usado pelo preview em tempo real no modal de campanha.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  const stageIdParams = [...sp.getAll("stageIds"), ...sp.getAll("stageIds[]")];
  const stageIds = [...new Set(stageIdParams.map((s) => s.trim()).filter(Boolean))];

  const tipoParams = [...sp.getAll("tipos"), ...sp.getAll("tipos[]")];
  const tipos = [...new Set(tipoParams.map((s) => s.trim().toLowerCase()).filter(Boolean))];

  const ufParams = [...sp.getAll("ufs"), ...sp.getAll("ufs[]")];
  const ufs = [...new Set(ufParams.map((s) => s.trim().toUpperCase()).filter((s) => s.length === 2))];

  // Build deal filter
  const dealWhere: Prisma.DealWhereInput = {
    workspaceId,
    closedAt: null,
    contactId: { not: null },
  };

  if (stageIds.length > 0) {
    dealWhere.stageId = { in: stageIds };
  }

  // Fetch deals matching stage filter, then filter by meta fields (tipo, UF)
  const deals = await db.deal.findMany({
    where: dealWhere,
    select: { contactId: true, meta: true },
    take: 10000,
  });

  // Filter by tipo de compra and UF from deal.meta
  const filteredContactIds = new Set<string>();
  for (const deal of deals) {
    const meta = (deal.meta ?? {}) as Record<string, unknown>;

    if (tipos.length > 0) {
      const dealTipo = String(meta["tipoPagamento"] ?? meta["tipo_pagamento"] ?? "").toLowerCase();
      if (!tipos.includes(dealTipo)) continue;
    }

    if (ufs.length > 0) {
      const dealUf = String(meta["imovelUF"] ?? meta["uf"] ?? "").toUpperCase();
      if (!ufs.includes(dealUf)) continue;
    }

    if (deal.contactId) {
      filteredContactIds.add(deal.contactId);
    }
  }

  // If no filters applied and no deals matched, count contacts with open deals
  if (stageIds.length === 0 && tipos.length === 0 && ufs.length === 0) {
    const count = await db.contact.count({
      where: {
        workspaceId,
        deals: { some: { workspaceId, closedAt: null } },
      },
    });
    return NextResponse.json({ count });
  }

  return NextResponse.json({ count: filteredContactIds.size });
}
