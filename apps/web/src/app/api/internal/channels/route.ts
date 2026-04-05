export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InternalChannelType, db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

const Schema = z.object({
  nome: z.string().min(1).max(160),
  tipo: z.nativeEnum(InternalChannelType).default(InternalChannelType.CANAL),
  membros: z.array(z.string().max(120)).optional(),
  dealId: z.string().cuid().optional(),
});

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await db.internalChannel.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    include: {
      _count: { select: { mensagens: true } },
    },
  });

  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const channel = await db.internalChannel.create({
    data: {
      workspaceId: session.workspaceId,
      nome: defaultSanitizer.clean(parsed.data.nome),
      tipo: parsed.data.tipo,
      membros: (parsed.data.membros ?? []).map((memberId) => defaultSanitizer.clean(memberId)),
      dealId: parsed.data.dealId ?? null,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "internal.channel.create",
    input: {
      nome: channel.nome,
      tipo: channel.tipo,
      membros: channel.membros,
      dealId: channel.dealId,
    },
    output: { channelId: channel.id },
  });

  return NextResponse.json({ ok: true, channel }, { status: 201 });
}
