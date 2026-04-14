/**
 * PUT /api/field-workflows/[id]/steps — Bulk save do canvas (steps+edges+templates)
 * Recebe estado inteiro do React Flow e sincroniza com o banco em transaction.
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import type { FieldStepType } from "@flow-os/db";

interface StepInput {
  id?: string;
  key: string;
  label: string;
  type: FieldStepType;
  position: number;
  positionX: number;
  positionY: number;
  config?: Record<string, unknown>;
  template?: {
    name: string;
    body: string;
    variables: string[];
  } | null;
}

interface EdgeInput {
  id?: string;
  sourceKey: string;
  targetKey: string;
  label?: string | null;
  condition?: Record<string, unknown> | null;
}

type Params = { params: Promise<{ id: string }> };

const VALID_STEP_TYPES: FieldStepType[] = [
  "SEND_MESSAGE", "WAIT_RESPONSE", "WAIT_DELAY", "CONDITION",
  "UPDATE_STATUS", "SCHEDULE_FOLLOWUP", "DISPATCH_NEXT",
];

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
    steps?: StepInput[];
    edges?: EdgeInput[];
  } | null;

  if (!body?.steps || !Array.isArray(body.steps)) {
    return NextResponse.json({ error: "steps é obrigatório" }, { status: 400 });
  }

  // Validar tipos
  for (const s of body.steps) {
    if (!VALID_STEP_TYPES.includes(s.type)) {
      return NextResponse.json({ error: `Tipo inválido: ${s.type}` }, { status: 400 });
    }
    if (!s.key || !s.label) {
      return NextResponse.json({ error: "key e label são obrigatórios em cada step" }, { status: 400 });
    }
  }

  // Transaction: deletar tudo e recriar
  await db.$transaction(async (tx) => {
    // Deletar edges e templates (cascade de steps não pega templates)
    await tx.fieldWorkflowEdge.deleteMany({ where: { workflowId } });
    await tx.fieldMessageTemplate.deleteMany({
      where: { step: { workflowId } },
    });
    await tx.fieldWorkflowStep.deleteMany({ where: { workflowId } });

    // Criar steps
    const keyToId = new Map<string, string>();
    for (const s of body.steps!) {
      const step = await tx.fieldWorkflowStep.create({
        data: {
          workflowId,
          key: s.key,
          label: s.label,
          type: s.type,
          position: s.position,
          positionX: s.positionX ?? 0,
          positionY: s.positionY ?? 0,
          config: (s.config ?? {}) as object,
        },
      });
      keyToId.set(s.key, step.id);

      // Criar template se fornecido
      if (s.template && s.type === "SEND_MESSAGE") {
        await tx.fieldMessageTemplate.create({
          data: {
            stepId: step.id,
            name: s.template.name || s.key,
            body: s.template.body,
            variables: s.template.variables ?? [],
          },
        });
      }
    }

    // Criar edges
    if (body.edges && Array.isArray(body.edges)) {
      for (const e of body.edges) {
        const sourceId = keyToId.get(e.sourceKey);
        const targetId = keyToId.get(e.targetKey);
        if (sourceId && targetId) {
          const edgeData: Prisma.FieldWorkflowEdgeUncheckedCreateInput = {
            workflowId,
            sourceId,
            targetId,
            label: e.label ?? null,
          };
          if (e.condition !== undefined && e.condition !== null) {
            edgeData.condition = e.condition as Prisma.InputJsonValue;
          }
          await tx.fieldWorkflowEdge.create({ data: edgeData });
        }
      }
    }

    // Incrementar version
    await tx.fieldWorkflow.update({
      where: { id: workflowId },
      data: { version: { increment: 1 } },
    });
  });

  return NextResponse.json({ ok: true });
}
