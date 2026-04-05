export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InternalMessageType, db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { publishInternalEvent } from "@/lib/sse-bus";

const Schema = z.object({
  conteudo: z.string().min(1).max(4000),
  tipo: z.nativeEnum(InternalMessageType).optional(),
  dealId: z.string().cuid().optional(),
  protocolId: z.string().cuid().optional(),
});

function looksLikeRealName(value: string): boolean {
  return /^[\p{L}\s.'-]{2,}$/u.test(value) && !value.includes("-");
}

function labelForRole(role: string): string {
  const labels: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Membro",
    VIEWER: "Viewer",
    DEV: "Dev",
    SISTEMA: "Sistema",
  };
  return labels[role] ?? role;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const channel = await db.internalChannel.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!channel) return NextResponse.json({ error: "Canal nao encontrado" }, { status: 404 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const messages = await db.internalMessage.findMany({
    where: {
      workspaceId: session.workspaceId,
      channelId: channel.id,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Enriquecer com dados do autor usando o que o projeto já possui em Member.
  const systemIds = new Set(["SISTEMA", "DEV", "SISTEMA_AUTO"]);
  const autorUserIds = [...new Set(
    messages.map(m => m.autorId).filter(id => !systemIds.has(id))
  )];

  const membros = autorUserIds.length
    ? await db.member.findMany({
        where: { userId: { in: autorUserIds }, workspaceId: session.workspaceId },
        select: { userId: true, role: true },
      })
    : [];

  const membroByUserId = Object.fromEntries(membros.map(m => [m.userId, m]));

  const enriched = messages.map(m => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    autor: systemIds.has(m.autorId)
      ? { name: "Sistema", role: "SISTEMA" }
      : m.autorId === session.userId
        ? { name: "Você", role: labelForRole(session.role) }
        : looksLikeRealName(m.autorId)
          ? { name: m.autorId, role: labelForRole(membroByUserId[m.autorId]?.role ?? "?") }
      : membroByUserId[m.autorId]
        ? { name: m.autorId.slice(0, 8), role: labelForRole(membroByUserId[m.autorId]!.role) }
        : { name: m.autorId.slice(0, 8), role: "?" },
  }));

  return NextResponse.json({
    messages: enriched.reverse(),
    nextCursor: messages.length === 20 ? messages[messages.length - 1]?.createdAt.toISOString() ?? null : null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const channel = await db.internalChannel.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!channel) return NextResponse.json({ error: "Canal nao encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.dealId) {
    const deal = await db.deal.findFirst({
      where: { id: parsed.data.dealId, workspaceId: session.workspaceId },
      select: { id: true },
    });
    if (!deal) return NextResponse.json({ error: "Deal nao encontrado" }, { status: 404 });
  }

  if (parsed.data.protocolId) {
    const protocol = await db.protocol.findFirst({
      where: { id: parsed.data.protocolId, workspaceId: session.workspaceId },
      select: { id: true },
    });
    if (!protocol) return NextResponse.json({ error: "Protocolo nao encontrado" }, { status: 404 });
  }

  const conteudo = defaultSanitizer.clean(parsed.data.conteudo);
  const message = await db.internalMessage.create({
    data: {
      workspaceId: session.workspaceId,
      channelId: channel.id,
      autorId: session.userId ?? "DEV",
      conteudo,
      tipo: parsed.data.tipo ?? InternalMessageType.TEXTO,
      dealId: parsed.data.dealId ?? null,
      protocolId: parsed.data.protocolId ?? null,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "internal.message.create",
    input: {
      channelId: channel.id,
      conteudo,
      tipo: parsed.data.tipo ?? InternalMessageType.TEXTO,
      dealId: parsed.data.dealId ?? null,
      protocolId: parsed.data.protocolId ?? null,
    },
    output: { internalMessageId: message.id },
  });

  publishInternalEvent({
    type: message.tipo === "ALERTA_Q1" ? "Q1_ALERT" : "MESSAGE_CREATED",
    workspaceId: session.workspaceId,
    channelId: channel.id,
    payload: { messageId: message.id, tipo: message.tipo, conteudo: message.conteudo },
    timestamp: Date.now(),
    ...(message.protocolId ? { protocolId: message.protocolId } : {}),
    ...(message.dealId ? { dealId: message.dealId } : {}),
  });

  return NextResponse.json({ ok: true, message }, { status: 201 });
}
