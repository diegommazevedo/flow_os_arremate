export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

const Schema = z.object({
  descricao: z.string().min(1).max(120).optional(),
  corFundo: z.string().min(1).max(20).optional(),
  corTexto: z.string().min(1).max(20).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await db.chatTag.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!tag) return NextResponse.json({ error: "Tag nao encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await db.chatTag.update({
    where: { id: tag.id },
    data: {
      ...(parsed.data.descricao !== undefined ? { descricao: defaultSanitizer.clean(parsed.data.descricao) } : {}),
      ...(parsed.data.corFundo !== undefined ? { corFundo: defaultSanitizer.clean(parsed.data.corFundo) } : {}),
      ...(parsed.data.corTexto !== undefined ? { corTexto: defaultSanitizer.clean(parsed.data.corTexto) } : {}),
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.tag.update",
    input: { tagId: tag.id },
    output: { tagId: updated.id },
  });

  return NextResponse.json({ ok: true, tag: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await db.chatTag.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, descricao: true },
  });
  if (!tag) return NextResponse.json({ error: "Tag nao encontrada" }, { status: 404 });

  await db.chatTag.delete({
    where: { id: tag.id },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.tag.delete",
    input: { tagId: tag.id },
    output: { descricao: tag.descricao },
  });

  return NextResponse.json({ ok: true });
}
