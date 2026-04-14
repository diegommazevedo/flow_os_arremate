/**
 * POST /api/vistoria/[token]/confirm — últimos 4 dígitos do celular (Partner.phone).
 * [SEC-08] entrada só dígitos; máx. 3 tentativas em assignment.meta.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";

type Params = { params: Promise<{ token: string }> };

const MAX_ATTEMPTS = 3;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function lastFourFromPhone(phone: string | null | undefined): string | null {
  const d = digitsOnly(phone ?? "");
  if (d.length < 4) return null;
  return d.slice(-4);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    select: {
      id: true,
      status: true,
      meta: true,
      agent: { select: { partner: { select: { phone: true } } } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  if (assignment.status === "COMPLETED") {
    return NextResponse.json({ error: "Vistoria já concluída" }, { status: 400 });
  }

  const meta = (assignment.meta ?? {}) as Record<string, unknown>;
  if (meta["confirmLocked"] === true) {
    return NextResponse.json({ ok: false, locked: true, error: "Link bloqueado. Entre em contato." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { lastFourDigits?: string } | null;
  const input = digitsOnly(body?.lastFourDigits ?? "").slice(-4);
  if (input.length !== 4) {
    return NextResponse.json({ ok: false, error: "Informe 4 dígitos" }, { status: 400 });
  }

  const expected = lastFourFromPhone(assignment.agent.partner.phone);
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Telefone não cadastrado para esta missão." }, { status: 503 });
  }

  if (input === expected) {
    return NextResponse.json({ ok: true });
  }

  const prev = typeof meta["confirmAttempts"] === "number" ? meta["confirmAttempts"] : 0;
  const next = prev + 1;
  const locked = next >= MAX_ATTEMPTS;
  const nextMeta = {
    ...meta,
    confirmAttempts: next,
    ...(locked ? { confirmLocked: true } : {}),
  };

  await db.fieldAssignment.update({
    where: { id: assignment.id },
    data: { meta: nextMeta as object },
  });

  if (locked) {
    return NextResponse.json({ ok: false, locked: true, error: "Link bloqueado. Entre em contato." }, { status: 403 });
  }

  return NextResponse.json({
    ok: false,
    attemptsLeft: MAX_ATTEMPTS - next,
    error: "Número incorreto. Tente novamente.",
  });
}
