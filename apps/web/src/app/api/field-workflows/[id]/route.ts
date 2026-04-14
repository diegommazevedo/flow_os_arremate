/**
 * GET    /api/field-workflows/[id] — workflow completo (steps+edges+templates+config)
 * PUT    /api/field-workflows/[id] — atualizar nome/descrição
 * DELETE /api/field-workflows/[id] — deletar (bloqueia se isActive)
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const workflow = await db.fieldWorkflow.findFirst({
    where: { id, workspaceId },
    include: {
      steps: {
        include: { template: true },
        orderBy: { position: "asc" },
      },
      edges: true,
      config: true,
    },
  });

  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ workflow });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
  } | null;

  const existing = await db.fieldWorkflow.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { name?: string; description?: string } = {};
  if (body?.name) data.name = body.name.trim().slice(0, 120);
  if (body?.description !== undefined) data.description = (body.description ?? "").slice(0, 500);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  await db.fieldWorkflow.update({ where: { id }, data });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const workflow = await db.fieldWorkflow.findFirst({
    where: { id, workspaceId },
    select: { id: true, isActive: true, isDefault: true },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workflow.isActive) {
    return NextResponse.json({ error: "Não é possível deletar workflow ativo. Desative antes." }, { status: 400 });
  }
  if (workflow.isDefault) {
    return NextResponse.json({ error: "Não é possível deletar workflow padrão." }, { status: 400 });
  }

  await db.fieldWorkflow.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
