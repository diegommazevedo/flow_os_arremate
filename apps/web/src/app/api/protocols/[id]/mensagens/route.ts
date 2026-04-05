export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MessageDirection, ProtocolChannel, db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { publishInternalEvent } from "@/lib/sse-bus";

const Schema = z.object({
  conteudo: z.string().min(1).max(4000),
  canal: z.nativeEnum(ProtocolChannel),
  direction: z.nativeEnum(MessageDirection),
  templateId: z.string().max(120).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const protocol = await db.protocol.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!protocol) return NextResponse.json({ error: "Protocolo nao encontrado" }, { status: 404 });

  const mensagens = await db.protocolMessage.findMany({
    where: { workspaceId: session.workspaceId, protocolId: protocol.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ mensagens });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const protocol = await db.protocol.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, dealId: true },
  });
  if (!protocol) return NextResponse.json({ error: "Protocolo nao encontrado" }, { status: 404 });

  const conteudo = defaultSanitizer.clean(parsed.data.conteudo);
  const mensagem = await db.protocolMessage.create({
    data: {
      workspaceId: session.workspaceId,
      protocolId: protocol.id,
      direction: parsed.data.direction,
      canal: parsed.data.canal,
      conteudo,
      autorId: session.userId ?? "DEV",
      templateId: parsed.data.templateId ?? null,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "protocol.message.create",
    input: {
      protocolId: protocol.id,
      direction: parsed.data.direction,
      canal: parsed.data.canal,
      conteudo,
    },
    output: { protocolMessageId: mensagem.id, dealId: protocol.dealId },
  });

  publishInternalEvent({
    type: "PROTOCOL_UPDATED",
    workspaceId: session.workspaceId,
    protocolId: protocol.id,
    dealId: protocol.dealId,
    payload: { messageId: mensagem.id, direction: mensagem.direction, canal: mensagem.canal },
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true, mensagem }, { status: 201 });
}
