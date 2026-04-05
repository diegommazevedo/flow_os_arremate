export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

const Schema = z.object({
  descricao: z.string().min(1).max(120),
  corFundo: z.string().min(1).max(20).optional(),
  corTexto: z.string().min(1).max(20).optional(),
});

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tags = await db.chatTag.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: [{ ordem: "asc" }, { descricao: "asc" }],
  });

  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const descricao = defaultSanitizer.clean(parsed.data.descricao);
  const corFundo = defaultSanitizer.clean(parsed.data.corFundo ?? "#6366f1");
  const corTexto = defaultSanitizer.clean(parsed.data.corTexto ?? "#ffffff");

  const ordem = await db.chatTag.count({
    where: { workspaceId: session.workspaceId },
  });

  const tag = await db.chatTag.create({
    data: {
      workspaceId: session.workspaceId,
      descricao,
      corFundo,
      corTexto,
      ordem,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.tag.create",
    input: { descricao, corFundo, corTexto },
    output: { tagId: tag.id },
  });

  return NextResponse.json({ ok: true, tag }, { status: 201 });
}
