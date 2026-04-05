export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

const Schema = z.object({
  atalho: z.string().min(1).max(80),
  texto: z.string().min(1).max(4000),
});

export async function GET(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  // Atalhos no BD são "boas", "payment_doc" — no chat digita-se "/boas"; sem remover "/" o contains falha.
  const q = raw.replace(/^\//, "").trim();
  const respostas = await db.respostaRapida.findMany({
    where: {
      workspaceId: session.workspaceId,
      ...(q.length > 0 ? { atalho: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ atalho: "asc" }],
    take: 50,
  });

  return NextResponse.json({ respostas });
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const atalho = defaultSanitizer.clean(parsed.data.atalho);
  const texto = defaultSanitizer.clean(parsed.data.texto);

  const resposta = await db.respostaRapida.create({
    data: {
      workspaceId: session.workspaceId,
      atalho,
      texto,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.quick_reply.create",
    input: { atalho, texto },
    output: { respostaRapidaId: resposta.id },
  });

  return NextResponse.json({ ok: true, resposta }, { status: 201 });
}
