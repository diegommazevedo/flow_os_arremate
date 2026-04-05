import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import type { EisenhowerQuadrant } from "@/app/(portal)/eisenhower/_lib/eisenhower-queries";

// ── Classification rules ──────────────────────────────────────────────────────

function classify(meta: Record<string, unknown>, updatedAt: Date): EisenhowerQuadrant {
  const now     = Date.now();
  const deadline = meta["paymentDeadline"]
    ? new Date(meta["paymentDeadline"] as string).getTime()
    : null;
  const daysSinceUpdate = (now - updatedAt.getTime()) / 86_400_000;

  if (deadline !== null && deadline - now < 48 * 3_600_000) return "Q1_DO";
  if (deadline !== null && deadline - now < 7  * 86_400_000) return "Q2_PLAN";
  if (daysSinceUpdate > 30) return "Q4_ELIMINATE";
  return "Q3_DELEGATE";
}

// ── POST /api/eisenhower/reclassificar ─────────────────────────────────────────

export async function POST() {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = session;

  const rawDeals = await db.deal.findMany({
    where: { workspaceId, closedAt: null },
    select: {
      id: true,
      title: true,
      value: true,
      ownerId: true,
      meta: true,
      updatedAt: true,
      contact: { select: { name: true } },
    },
  });

  const distribution: Record<EisenhowerQuadrant, number> = {
    Q1_DO: 0, Q2_PLAN: 0, Q3_DELEGATE: 0, Q4_ELIMINATE: 0,
  };
  let reclassificados = 0;

  const updates: Array<{ id: string; newMeta: Prisma.InputJsonValue }> = [];

  for (const deal of rawDeals) {
    const meta     = (deal.meta ?? {}) as Record<string, unknown>;
    const newQ     = classify(meta, deal.updatedAt);
    const current  = (meta["eisenhower"] as EisenhowerQuadrant) ?? "Q4_ELIMINATE";

    distribution[newQ]++;

    if (current !== newQ) {
      reclassificados++;
      updates.push({
        id: deal.id,
        newMeta: { ...meta, eisenhower: newQ } as Prisma.InputJsonValue,
      });
    }
  }

  // Batch update — multi-tenant scoped [SEC-03]
  await Promise.all(
    updates.map((u) =>
      db.deal.updateMany({
        where: { id: u.id, workspaceId },
        data:  { meta: u.newMeta },
      }),
    ),
  );

  // AuditLog [SEC-06]
  const sysAgent = await db.agent.findFirst({ where: { workspaceId }, select: { id: true } }).catch(() => null);
  if (sysAgent) {
    await db.agentAuditLog.create({
      data: {
        workspaceId,
        agentId:   sysAgent.id,
        action:    "eisenhower.batch_reclassify",
        input:     { reclassificados, distribuicao: distribution } as Prisma.InputJsonValue,
        output:    { ok: true } as Prisma.InputJsonValue,
        modelUsed: "rule_based",
        tokensUsed: 0,
        costUsd:    0,
        durationMs: 0,
        success:    true,
      },
    }).catch(() => null);
  }

  // Return updated deals for immediate UI refresh
  const updatedRaw = await db.deal.findMany({
    where: { workspaceId, closedAt: null },
    select: {
      id: true, title: true, value: true, ownerId: true,
      meta: true, updatedAt: true,
      contact: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const deals = updatedRaw.map((d) => {
    const m = ((d.meta ?? {}) as Record<string, unknown>);
    return {
      id: d.id,
      title: d.title,
      value: d.value ? Number(d.value) : 0,
      ownerId: d.ownerId ?? null,
      quadrant: ((m["eisenhower"] as EisenhowerQuadrant) ?? "Q4_ELIMINATE"),
      phase: (m["currentPhase"] as string) ?? "",
      paymentDeadline: (m["paymentDeadline"] as string) ?? null,
      contactName: d.contact?.name ?? null,
      uf: (m["uf"] as string) ?? null,
      updatedAt: d.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({
    reclassificados,
    distribuicao: distribution,
    deals,
  });
}
