/**
 * GET /api/vistoria/[token] — PWA público por pwaAccessToken (sem sessão).
 * [SEC-08] resposta mínima; não expõe workspaceId.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    include: {
      deal: { select: { meta: true } },
      profile: true,
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const meta = (assignment.deal?.meta ?? {}) as Record<string, unknown>;
  const endereco = String(meta["imovelEndereco"] ?? meta["endereco"] ?? "");
  const cidade = String(meta["imovelCidade"] ?? meta["cidade"] ?? "");
  const uf = String(meta["imovelUF"] ?? meta["uf"] ?? "");

  const prof = assignment.profile;
  const profilePayload = prof
    ? {
        name: prof.name,
        level: prof.level,
        bandeiradaValue: prof.bandeiradaValue,
        maxValue: prof.maxValue,
        currency: prof.currency,
        items: prof.items,
        skipPenalty: prof.skipPenalty,
        skipRequiresText: prof.skipRequiresText,
        skipMinChars: prof.skipMinChars,
        skipMaxItems: prof.skipMaxItems,
        skipReasons: prof.skipReasons,
        deadlineHours: prof.deadlineHours,
      }
    : null;

  return NextResponse.json({
    assignment: {
      id: assignment.id,
      dealId: assignment.dealId,
      status: assignment.status,
      evidenceCount: assignment.evidenceCount,
    },
    imovel: { endereco, cidade, uf },
    profile: profilePayload,
    riskBadge:
      prof?.level === "UP"
        ? "ÁREA DE RISCO — regras especiais"
        : prof?.level === "DOWN"
          ? "Missão simplificada"
          : "Padrão",
  });
}
