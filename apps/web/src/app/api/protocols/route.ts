export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProtocolChannel, db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { generateProtocol } from "@flow-os/brain/lib/protocol-generator";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { publishInternalEvent } from "@/lib/sse-bus";

const CreateSchema = z.object({
  dealId: z.string().cuid(),
  taskId: z.string().cuid().optional(),
  canal: z.nativeEnum(ProtocolChannel).optional(),
  assunto: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId") ?? undefined;
  const taskId = req.nextUrl.searchParams.get("taskId") ?? undefined;

  const protocols = await db.protocol.findMany({
    where: {
      workspaceId: session.workspaceId,
      ...(dealId ? { dealId } : {}),
      ...(taskId ? { taskId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      mensagens: {
        orderBy: { createdAt: "asc" },
        take: 100,
      },
      _count: {
        select: { mensagens: true },
      },
    },
  });

  return NextResponse.json({ protocols });
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const deal = await db.deal.findFirst({
    where: { id: parsed.data.dealId, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!deal) return NextResponse.json({ error: "Deal nao encontrado" }, { status: 404 });

  const assunto = parsed.data.assunto ? defaultSanitizer.clean(parsed.data.assunto) : undefined;
  const { protocol, number } = await generateProtocol(
    parsed.data.dealId,
    session.workspaceId,
    parsed.data.canal ?? ProtocolChannel.WHATSAPP,
    assunto,
    parsed.data.taskId,
  );

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "protocol.create",
    input: {
      dealId: parsed.data.dealId,
      taskId: parsed.data.taskId ?? null,
      canal: parsed.data.canal ?? ProtocolChannel.WHATSAPP,
      assunto: assunto ?? null,
    },
    output: { protocolId: protocol.id, number },
  });

  publishInternalEvent({
    type: "PROTOCOL_UPDATED",
    workspaceId: session.workspaceId,
    protocolId: protocol.id,
    dealId: protocol.dealId,
    payload: { number, status: protocol.status, canal: protocol.canal },
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true, protocol, number }, { status: 201 });
}
