/**
 * PATCH /api/vistoria/[token]/item/[itemId] — estado de item (done/skipped) em assignment.meta.itemStates
 * [SEC-08] itemId alfanumérico curto; body sanitizado.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";

type Params = { params: Promise<{ token: string; itemId: string }> };

const ITEM_ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, itemId } = await params;
  if (!token || token.length < 8 || !ITEM_ID_RE.test(itemId)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    select: { id: true, status: true, meta: true },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  if (assignment.status === "COMPLETED") {
    return NextResponse.json({ error: "Vistoria já concluída" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    status?: string;
    skipReason?: string;
    text?: string;
  } | null;

  if (!body?.status || !["done", "skipped"].includes(body.status)) {
    return NextResponse.json({ error: "status deve ser done ou skipped" }, { status: 400 });
  }

  const meta = { ...((assignment.meta ?? {}) as Record<string, unknown>) };
  const itemStates = { ...((meta["itemStates"] as Record<string, unknown> | undefined) ?? {}) };

  const skipReason = typeof body.skipReason === "string"
    ? body.skipReason.trim().slice(0, 2000)
    : undefined;

  itemStates[itemId] = {
    status: body.status,
    ...(body.status === "skipped" && skipReason ? { skipReason } : {}),
    savedAt: new Date().toISOString(),
  };
  meta["itemStates"] = itemStates;

  if (itemId === "text" && typeof body.text === "string") {
    meta["descricaoTexto"] = body.text.trim().slice(0, 20000);
  }

  await db.fieldAssignment.update({
    where: { id: assignment.id },
    data: { meta: meta as object },
  });

  return NextResponse.json({ ok: true });
}
