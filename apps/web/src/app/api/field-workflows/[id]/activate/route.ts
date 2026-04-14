/**
 * POST /api/field-workflows/[id]/activate — ativar workflow (desativa os outros)
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const workflow = await db.fieldWorkflow.findFirst({
    where: { id, workspaceId },
    select: { id: true, isActive: true },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Transaction: desativar todos e ativar o selecionado
  await db.$transaction([
    db.fieldWorkflow.updateMany({
      where: { workspaceId, isActive: true },
      data: { isActive: false },
    }),
    db.fieldWorkflow.update({
      where: { id },
      data: { isActive: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
