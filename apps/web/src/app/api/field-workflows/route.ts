/**
 * GET  /api/field-workflows — listar workflows do workspace
 * POST /api/field-workflows — criar novo workflow (clone do default ou vazio)
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflows = await db.fieldWorkflow.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { steps: true, edges: true } },
      config: { select: { agentLimit: true, deadlineHours: true } },
    },
  });

  const items = workflows.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    isActive: w.isActive,
    isDefault: w.isDefault,
    version: w.version,
    stepCount: w._count.steps,
    edgeCount: w._count.edges,
    agentLimit: w.config?.agentLimit ?? 3,
    deadlineHours: w.config?.deadlineHours ?? 48,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    cloneFromDefault?: boolean;
  } | null;

  const name = (body?.name ?? "").trim().slice(0, 120) || "Novo Workflow";

  // Verificar unicidade
  const existing = await db.fieldWorkflow.findFirst({
    where: { workspaceId, name },
  });
  if (existing) {
    return NextResponse.json({ error: "Já existe um workflow com esse nome" }, { status: 400 });
  }

  if (body?.cloneFromDefault) {
    // Clonar do workflow padrão (default)
    const source = await db.fieldWorkflow.findFirst({
      where: { workspaceId, isDefault: true },
      include: {
        steps: { include: { template: true }, orderBy: { position: "asc" } },
        edges: true,
        config: true,
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Workflow padrão não encontrado para clonar" }, { status: 404 });
    }

    // Criar workflow clone
    const clone = await db.fieldWorkflow.create({
      data: {
        workspaceId,
        name,
        description: `Clonado de "${source.name}"`,
        isActive: false,
        isDefault: false,
        version: 1,
      },
    });

    // Clonar steps (mapeando IDs antigos para novos)
    const idMap = new Map<string, string>();
    for (const step of source.steps) {
      const newStep = await db.fieldWorkflowStep.create({
        data: {
          workflowId: clone.id,
          key: step.key,
          label: step.label,
          type: step.type,
          position: step.position,
          positionX: step.positionX,
          positionY: step.positionY,
          config: step.config as object,
        },
      });
      idMap.set(step.id, newStep.id);

      // Clonar template se existir
      if (step.template) {
        await db.fieldMessageTemplate.create({
          data: {
            stepId: newStep.id,
            name: step.template.name,
            body: step.template.body,
            variables: step.template.variables,
          },
        });
      }
    }

    // Clonar edges
    for (const edge of source.edges) {
      const newSourceId = idMap.get(edge.sourceId);
      const newTargetId = idMap.get(edge.targetId);
      if (newSourceId && newTargetId) {
        const edgeData: Prisma.FieldWorkflowEdgeUncheckedCreateInput = {
          workflowId: clone.id,
          sourceId: newSourceId,
          targetId: newTargetId,
          label: edge.label,
        };
        if (edge.condition != null) {
          edgeData.condition = edge.condition as Prisma.InputJsonValue;
        }
        await db.fieldWorkflowEdge.create({ data: edgeData });
      }
    }

    // Clonar config
    if (source.config) {
      await db.fieldWorkflowConfig.create({
        data: {
          workflowId: clone.id,
          agentLimit: source.config.agentLimit,
          followupDelayMs: source.config.followupDelayMs,
          deadlineHours: source.config.deadlineHours,
          priceDefault: source.config.priceDefault,
          currency: source.config.currency,
          evidenceTypes: source.config.evidenceTypes as object,
          evidenceMinimum: source.config.evidenceMinimum,
          autoRetry: source.config.autoRetry,
        },
      });
    }

    return NextResponse.json({ id: clone.id }, { status: 201 });
  }

  // Criar workflow vazio
  const workflow = await db.fieldWorkflow.create({
    data: {
      workspaceId,
      name,
      isActive: false,
      isDefault: false,
      version: 1,
    },
  });

  // Criar config padrão
  await db.fieldWorkflowConfig.create({
    data: { workflowId: workflow.id },
  });

  return NextResponse.json({ id: workflow.id }, { status: 201 });
}
