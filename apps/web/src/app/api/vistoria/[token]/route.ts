/**
 * GET /api/vistoria/[token] — PWA público por pwaAccessToken (sem sessão).
 * [SEC-08] resposta mínima; não expõe workspaceId.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";

type Params = { params: Promise<{ token: string }> };

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function maskPhoneSimple(phone: string | null | undefined): string | null {
  const d = digitsOnly(phone ?? "");
  if (d.length < 4) return null;
  const last4 = d.slice(-4);
  return `+55 ** ****-${last4}`;
}

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
      agent: { include: { partner: { select: { phone: true } } } },
      evidences: { select: { description: true, mediaUrl: true, mimeType: true, aiAnalysis: true } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const assignMeta = (assignment.meta ?? {}) as Record<string, unknown>;
  const itemStates = (assignMeta["itemStates"] as Record<string, { status?: string; skipReason?: string; savedAt?: string }> | undefined) ?? {};
  const descricaoTexto = typeof assignMeta["descricaoTexto"] === "string" ? assignMeta["descricaoTexto"] : "";

  const evidenceByItem: Array<{ itemId: string; mediaUrl: string; mimeType: string }> = [];
  for (const ev of assignment.evidences) {
    const aid = ev.aiAnalysis as Record<string, unknown> | null;
    const itemId = typeof ev.description === "string" && ev.description
      ? ev.description
      : typeof aid?.["itemId"] === "string"
        ? aid["itemId"]
        : "";
    if (itemId) {
      evidenceByItem.push({ itemId, mediaUrl: ev.mediaUrl, mimeType: ev.mimeType });
    }
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

  const phone = assignment.agent.partner.phone;
  const phoneMasked = maskPhoneSimple(phone);

  return NextResponse.json({
    assignment: {
      id: assignment.id,
      dealId: assignment.dealId,
      status: assignment.status,
      evidenceCount: assignment.evidenceCount,
      confirmLocked: assignMeta["confirmLocked"] === true,
      itemStates,
      descricaoTexto,
    },
    phoneMasked,
    phoneConfirmAvailable: phoneMasked !== null,
    evidenceByItem,
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
