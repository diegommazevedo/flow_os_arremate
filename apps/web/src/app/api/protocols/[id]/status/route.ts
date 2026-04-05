export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { publishInternalEvent } from "@/lib/sse-bus";

const Schema = z.object({
  status: z.enum(["ABERTO", "EM_ATENDIMENTO", "AGUARDANDO", "RESOLVIDO", "FECHADO"]),
});

export async function PATCH(
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
    select: { id: true, dealId: true, status: true },
  });
  if (!protocol) return NextResponse.json({ error: "Protocolo nao encontrado" }, { status: 404 });

  await db.protocol.updateMany({
    where: { id: protocol.id, workspaceId: session.workspaceId },
    data: {
      status: parsed.data.status,
      resolvidoEm: parsed.data.status === "RESOLVIDO" ? new Date() : null,
    },
  });
  const updated = await db.protocol.findFirst({
    where: { id: protocol.id, workspaceId: session.workspaceId },
  });
  if (!updated) return NextResponse.json({ error: "Protocolo nao encontrado apos atualizacao" }, { status: 500 });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "protocol.status.update",
    input: { protocolId: protocol.id, status: parsed.data.status },
    output: { previousStatus: protocol.status, nextStatus: updated.status },
  });

  publishInternalEvent({
    type: "PROTOCOL_UPDATED",
    workspaceId: session.workspaceId,
    protocolId: updated.id,
    dealId: updated.dealId,
    payload: { status: updated.status, resolvidoEm: updated.resolvidoEm?.toISOString() ?? null },
    timestamp: Date.now(),
  });

  return NextResponse.json({ ok: true, protocol: updated });
}
