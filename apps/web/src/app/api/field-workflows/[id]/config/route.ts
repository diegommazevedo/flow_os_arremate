/**
 * GET /api/field-workflows/[id]/config — ler config
 * PUT /api/field-workflows/[id]/config — atualizar config
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workflowId } = await params;

  const workflow = await db.fieldWorkflow.findFirst({
    where: { id: workflowId, workspaceId },
    select: { id: true },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const config = await db.fieldWorkflowConfig.findUnique({
    where: { workflowId },
  });

  return NextResponse.json({ config: config ?? null });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workflowId } = await params;

  const workflow = await db.fieldWorkflow.findFirst({
    where: { id: workflowId, workspaceId },
    select: { id: true },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    agentLimit?: number;
    followupDelayMs?: number;
    deadlineHours?: number;
    priceDefault?: number;
    currency?: string;
    evidenceTypes?: string[];
    evidenceMinimum?: number;
    autoRetry?: boolean;
  } | null;

  if (!body) return NextResponse.json({ error: "Body vazio" }, { status: 400 });

  const updateData: Prisma.FieldWorkflowConfigUpdateInput = {};
  const createData: Prisma.FieldWorkflowConfigUncheckedCreateInput = { workflowId };

  if (typeof body.agentLimit === "number" && body.agentLimit > 0 && body.agentLimit <= 20) {
    updateData.agentLimit = body.agentLimit;
    createData.agentLimit = body.agentLimit;
  }
  if (typeof body.followupDelayMs === "number" && body.followupDelayMs >= 60000) {
    updateData.followupDelayMs = body.followupDelayMs;
    createData.followupDelayMs = body.followupDelayMs;
  }
  if (typeof body.deadlineHours === "number" && body.deadlineHours > 0) {
    updateData.deadlineHours = body.deadlineHours;
    createData.deadlineHours = body.deadlineHours;
  }
  if (typeof body.priceDefault === "number" && body.priceDefault >= 0) {
    updateData.priceDefault = body.priceDefault;
    createData.priceDefault = body.priceDefault;
  }
  if (body.currency) {
    const c = body.currency.slice(0, 3).toUpperCase();
    updateData.currency = c;
    createData.currency = c;
  }
  if (Array.isArray(body.evidenceTypes)) {
    updateData.evidenceTypes = body.evidenceTypes;
    createData.evidenceTypes = body.evidenceTypes;
  }
  if (typeof body.evidenceMinimum === "number") {
    updateData.evidenceMinimum = body.evidenceMinimum;
    createData.evidenceMinimum = body.evidenceMinimum;
  }
  if (typeof body.autoRetry === "boolean") {
    updateData.autoRetry = body.autoRetry;
    createData.autoRetry = body.autoRetry;
  }

  await db.fieldWorkflowConfig.upsert({
    where: { workflowId },
    update: updateData,
    create: createData,
  });

  return NextResponse.json({ ok: true });
}
