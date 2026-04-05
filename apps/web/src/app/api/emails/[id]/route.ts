export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionWorkspaceId } from "@/lib/session";

// ── GET /api/emails/[id] ── retorna email completo, marca como lido ───────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // [SEC-03] workspaceId na query
  const email = await db.email.findFirst({
    where: { id, workspaceId },
    include: { account: { select: { id: true, nome: true, email: true } } },
  });
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!email.lido) {
    await db.email.update({ where: { id }, data: { lido: true } });
  }

  return NextResponse.json({ email: { ...email, lido: true } });
}

// ── PATCH /api/emails/[id] ── atualiza lido/importante/labels ────────────────

const PatchSchema = z.object({
  lido:       z.boolean().optional(),
  importante: z.boolean().optional(),
  respondido: z.boolean().optional(),
  labels:     z.array(z.string().max(80)).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // [SEC-03] workspaceId na query de existência
  const exists = await db.email.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { lido, importante, respondido, labels } = parsed.data;

  // [SEC-08] Sanitizar labels (texto externo)
  const safeLabels = labels?.map((l) => defaultSanitizer.clean(l));

  const email = await db.email.update({
    where: { id },
    data: {
      ...(lido !== undefined ? { lido } : {}),
      ...(importante !== undefined ? { importante } : {}),
      ...(respondido !== undefined ? { respondido } : {}),
      ...(safeLabels !== undefined ? { labels: safeLabels } : {}),
    },
  });

  return NextResponse.json({ ok: true, email });
}
