/**
 * POST /api/vistoria/[token]/cadastro — salvar CPF + PIX do motoboy
 * Rota pública — sem sessão, autenticada por pwaAccessToken.
 * [SEC-08] sanitizar CPF e PIX.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { PixKeyType } from "@flow-os/db";

type Params = { params: Promise<{ token: string }> };

const VALID_PIX_TYPES: PixKeyType[] = ["CPF", "EMAIL", "PHONE", "EVP"];

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    select: { id: true, agentId: true, status: true, agent: { select: { partnerId: true } } },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  if (assignment.status === "COMPLETED") {
    return NextResponse.json({ error: "Vistoria já concluída" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    cpf?: string;
    email?: string;
    pixKeyType?: string;
    pixKey?: string;
  } | null;

  if (!body) return NextResponse.json({ error: "Body vazio" }, { status: 400 });

  // Sanitizar CPF (somente dígitos)
  const cpf = (body.cpf ?? "").replace(/\D/g, "").slice(0, 11);
  if (cpf.length !== 11) {
    return NextResponse.json({ error: "CPF inválido (11 dígitos)" }, { status: 400 });
  }

  const pixKeyType = (body.pixKeyType ?? "CPF") as PixKeyType;
  if (!VALID_PIX_TYPES.includes(pixKeyType)) {
    return NextResponse.json({ error: "Tipo de chave PIX inválido" }, { status: 400 });
  }

  const pixKey = (body.pixKey ?? "").trim().slice(0, 120);
  if (!pixKey) {
    return NextResponse.json({ error: "Chave PIX obrigatória" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }

  await db.fieldAgentProfile.update({
    where: { id: assignment.agentId },
    data: {
      cpf,
      pixKey,
      pixKeyType,
    },
  });

  await db.partner.update({
    where: { id: assignment.agent.partnerId },
    data: {
      email,
      document: cpf,
    },
  });

  return NextResponse.json({ ok: true });
}
