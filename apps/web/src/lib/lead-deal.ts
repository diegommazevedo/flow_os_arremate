/**
 * Garante um Deal aberto por contato para campanhas / importação.
 * [SEC-03] workspaceId em todas as queries.
 * [P-02] Endereço e localização apenas em Deal.meta.
 */

import { db, type Prisma } from "@flow-os/db";

export async function ensureOpenDealForContact(
  workspaceId: string,
  contactId: string,
  metaPatch: Record<string, unknown>,
  titleHint?: string,
): Promise<string> {
  const existing = await db.deal.findFirst({
    where: { workspaceId, contactId, closedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, meta: true, title: true },
  });

  if (existing) {
    const meta = { ...((existing.meta ?? {}) as Record<string, unknown>), ...metaPatch };
    await db.deal.update({
      where: { id: existing.id, workspaceId },
      data: {
        meta: meta as Prisma.InputJsonValue,
        ...(titleHint ? { title: titleHint } : {}),
      },
    });
    return existing.id;
  }

  const firstStage = await db.stage.findFirst({
    where: { workspaceId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!firstStage) {
    throw new Error("Workspace sem estágios configurados");
  }

  const deal = await db.deal.create({
    data: {
      workspaceId,
      stageId: firstStage.id,
      contactId,
      title: titleHint ?? "Lead cockpit",
      meta: {
        eisenhower: "Q2_PLAN",
        kanbanStatus: "inbox",
        currentPhase: "triagem",
        ...metaPatch,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return deal.id;
}
