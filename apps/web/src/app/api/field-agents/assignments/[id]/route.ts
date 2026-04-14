/**
 * GET   /api/field-agents/assignments/[id] — detalhe com evidências
 * PATCH /api/field-agents/assignments/[id] — cancelar assignment
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

  const assignment = await db.fieldAssignment.findFirst({
    where: { id, workspaceId },
    include: {
      deal: { select: { id: true, title: true, meta: true } },
      agent: {
        include: {
          partner: { select: { id: true, name: true, phone: true } },
        },
      },
      evidences: { orderBy: { capturedAt: "desc" } },
    },
  });

  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ assignment });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;

  if (body?.status !== "CANCELLED") {
    return NextResponse.json({ error: "Apenas CANCELLED é permitido via PATCH" }, { status: 400 });
  }

  const assignment = await db.fieldAssignment.findFirst({
    where: { id, workspaceId },
    select: { id: true, status: true },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (["COMPLETED", "CANCELLED"].includes(assignment.status)) {
    return NextResponse.json({ error: "Assignment já finalizado" }, { status: 400 });
  }

  await db.fieldAssignment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
