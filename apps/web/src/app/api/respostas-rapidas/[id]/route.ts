export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const resposta = await db.respostaRapida.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, atalho: true },
  });

  if (!resposta) {
    return NextResponse.json({ error: "Resposta rapida nao encontrada" }, { status: 404 });
  }

  await db.respostaRapida.delete({
    where: { id: resposta.id },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.quick_reply.delete",
    input: { respostaRapidaId: resposta.id },
    output: { atalho: resposta.atalho },
  });

  return NextResponse.json({ ok: true });
}
