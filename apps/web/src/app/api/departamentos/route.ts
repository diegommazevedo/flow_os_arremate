export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

const Schema = z.object({
  nome: z.string().min(1).max(160),
  membros: z.array(z.string().max(120)).default([]),
});

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const departamentos = await db.department.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json({ departamentos });
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const nome = defaultSanitizer.clean(parsed.data.nome);
  const membros = parsed.data.membros.map((memberId) => defaultSanitizer.clean(memberId));

  const departamento = await db.department.create({
    data: {
      workspaceId: session.workspaceId,
      nome,
      membros,
    },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.department.create",
    input: { nome, membros },
    output: { departmentId: departamento.id },
  });

  return NextResponse.json({ ok: true, departamento }, { status: 201 });
}
