export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, Prisma } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { computeDueAt, PIPELINE_STAGES, type EtapaId } from "@flow-os/templates";
import { getSessionContext } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deal = await db.deal.findFirst({
    where: { id, workspaceId: session.workspaceId },
    include: { contact: { select: { id: true, name: true, phone: true, email: true } } },
  });
  if (!deal) return NextResponse.json({ error: "Deal nao encontrado" }, { status: 404 });

  return NextResponse.json({ deal });
}

const PatchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  ownerId: z.string().max(120).nullable().optional(),
  currentPhase: z.enum(PIPELINE_STAGES.map((stage) => stage.id) as [EtapaId, ...EtapaId[]]).optional(),
  status: z.enum(["won", "lost", "open"]).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

async function resolveAuditAgentId(workspaceId: string): Promise<string | null> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return agent?.id ?? null;
}

function mergeJsonObject(
  target: Record<string, Prisma.InputJsonValue | null>,
  source: Prisma.JsonObject | Prisma.InputJsonObject | null | undefined,
) {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      target[key] = value as Prisma.InputJsonValue | null;
    }
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const safeTitle = parsed.data.title !== undefined ? defaultSanitizer.clean(parsed.data.title) : undefined;
  const safeOwnerId = parsed.data.ownerId !== undefined && parsed.data.ownerId !== null
    ? defaultSanitizer.clean(parsed.data.ownerId)
    : parsed.data.ownerId;
  function sanitizeMeta(obj: unknown): unknown {
    if (typeof obj === "string") return defaultSanitizer.clean(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeMeta);
    if (obj && typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>).map(
          ([k, v]) => [k, sanitizeMeta(v)],
        ),
      );
    }
    return obj;
  }

  const safeMeta = sanitizeMeta(parsed.data.meta ?? {}) as Record<string, unknown>;

  const deal = await db.deal.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, meta: true, stageId: true, ownerId: true, title: true },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal não encontrado" }, { status: 404 });
  }

  const prevMetaRaw = (deal.meta ?? {}) as Record<string, unknown>;

  const nextMeta: Record<string, Prisma.InputJsonValue | null> = {};
  mergeJsonObject(nextMeta, (deal.meta ?? null) as Prisma.JsonObject | null);
  mergeJsonObject(nextMeta, Object.keys(safeMeta).length > 0 ? (safeMeta as Prisma.InputJsonObject) : null);

  let nextStageId: string | undefined;
  if (parsed.data.currentPhase) {
    const stageLabel = PIPELINE_STAGES.find((stage) => stage.id === parsed.data.currentPhase)?.label;
    if (stageLabel) {
      const stage = await db.stage.findFirst({
        where: { workspaceId: session.workspaceId, name: stageLabel },
        select: { id: true },
      });
      nextStageId = stage?.id;
    }
    nextMeta["currentPhase"] = parsed.data.currentPhase;

    const newStageId = parsed.data.currentPhase;
    const oldCanon = typeof prevMetaRaw["stageId"] === "string" ? prevMetaRaw["stageId"] : undefined;
    const stageChanged = oldCanon !== newStageId;

    if (stageChanged) {
      const entered = new Date();
      const limiteMerged =
        typeof nextMeta["limiteBoletoPagamento"] === "string" && nextMeta["limiteBoletoPagamento"].trim()
          ? (nextMeta["limiteBoletoPagamento"] as string)
          : typeof prevMetaRaw["limiteBoletoPagamento"] === "string" &&
              String(prevMetaRaw["limiteBoletoPagamento"]).trim()
            ? (prevMetaRaw["limiteBoletoPagamento"] as string)
            : null;
      const { dueAt, basis } = computeDueAt({
        stageId: newStageId,
        enteredAt: entered,
        ...(limiteMerged ? { externalDeadline: limiteMerged } : {}),
      });
      nextMeta["stageId"] = newStageId;
      nextMeta["dueAt"] = dueAt?.toISOString() ?? null;
      nextMeta["slaBasis"] = basis;
      nextMeta["stageEnteredAt"] = entered.toISOString();
    } else {
      for (const key of ["stageId", "dueAt", "slaBasis", "stageEnteredAt"] as const) {
        const v = prevMetaRaw[key];
        if (v !== undefined) {
          nextMeta[key] = v as Prisma.InputJsonValue;
        }
      }
    }
  }

  if (parsed.data.status === "won") {
    nextMeta["kanbanStatus"] = "concluido";
  }

  if (parsed.data.status === "lost") {
    nextMeta["kanbanStatus"] = "perdido";
  }

  if (parsed.data.status === "open") {
    nextMeta["kanbanStatus"] = "em_progresso";
  }

  const auditPayload: Record<string, Prisma.InputJsonValue | null> = {};
  if (safeTitle !== undefined) auditPayload["title"] = safeTitle;
  if (safeOwnerId !== undefined) auditPayload["ownerId"] = safeOwnerId;
  if (parsed.data.currentPhase !== undefined) auditPayload["currentPhase"] = parsed.data.currentPhase;
  if (parsed.data.status !== undefined) auditPayload["status"] = parsed.data.status;
  if (Object.keys(safeMeta).length > 0) auditPayload["meta"] = safeMeta as Prisma.InputJsonObject;

  const updated = await db.deal.update({
    where: { id: deal.id, workspaceId: session.workspaceId },
    data: {
      ...(safeTitle ? { title: safeTitle } : {}),
      ...(safeOwnerId !== undefined ? { ownerId: safeOwnerId || null } : {}),
      ...(nextStageId ? { stageId: nextStageId } : {}),
      ...(parsed.data.status === "won" ? { closedAt: new Date(), lostReason: null } : {}),
      ...(parsed.data.status === "lost" ? { closedAt: new Date(), lostReason: "Perdido manualmente" } : {}),
      ...(parsed.data.status === "open" ? { closedAt: null, lostReason: null } : {}),
      meta: nextMeta as Prisma.InputJsonObject,
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      closedAt: true,
      lostReason: true,
      meta: true,
    },
  });

  const auditOutput: Prisma.InputJsonObject = {
    dealId: updated.id,
    title: updated.title,
    ownerId: updated.ownerId,
  };

  const auditAgentId = await resolveAuditAgentId(session.workspaceId);
  if (auditAgentId) {
    await db.agentAuditLog.create({
      data: {
        workspaceId: session.workspaceId,
        agentId: auditAgentId,
        action: "deal.update",
        input: {
          dealId: deal.id,
          payload: auditPayload as Prisma.InputJsonObject,
        },
        output: auditOutput,
        modelUsed: "none",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
        success: true,
      },
    });
  }

  return NextResponse.json({ ok: true, deal: updated });
}
