export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

const Schema = z.object({
  nome:    z.string().min(1).max(160).optional(),
  membros: z.array(z.string().max(120)).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dept = await db.department.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!dept) return NextResponse.json({ error: "Departamento nao encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.nome !== undefined)
    updateData["nome"] = defaultSanitizer.clean(parsed.data.nome);
  if (parsed.data.membros !== undefined)
    updateData["membros"] = parsed.data.membros.map(m => defaultSanitizer.clean(m));

  const updated = await db.department.update({
    where: { id: dept.id },
    data:  updateData,
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.department.update",
    input:  { departmentId: dept.id, ...updateData },
    output: { departmentId: updated.id },
  });

  return NextResponse.json({ ok: true, departamento: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dept = await db.department.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, nome: true },
  });
  if (!dept) return NextResponse.json({ error: "Departamento nao encontrado" }, { status: 404 });

  await db.department.delete({ where: { id: dept.id } });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "chat.department.delete",
    input:  { departmentId: dept.id },
    output: { nome: dept.nome },
  });

  return NextResponse.json({ ok: true });
}
