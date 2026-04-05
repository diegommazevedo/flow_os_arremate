import { db } from "@flow-os/db";

// ── Types ──────────────────────────────────────────────────────────────────────

export type EisenhowerQuadrant =
  | "Q1_DO"
  | "Q2_PLAN"
  | "Q3_DELEGATE"
  | "Q4_ELIMINATE";

export interface DealCardData {
  id: string;
  title: string;
  value: number;
  ownerId: string | null;
  quadrant: EisenhowerQuadrant;
  phase: string;
  paymentDeadline: string | null;
  contactName: string | null;
  uf: string | null;
  updatedAt: string;
}

// ── Mapper ─────────────────────────────────────────────────────────────────────

type RawDeal = {
  id: string;
  title: string;
  value: { toNumber(): number } | number | null;
  ownerId: string | null;
  meta: unknown;
  updatedAt: Date;
  contact: { name: string } | null;
};

export function mapDealCard(d: RawDeal): DealCardData {
  const m = ((d.meta ?? {}) as Record<string, unknown>);
  const rawVal = d.value;
  const numVal = rawVal == null ? 0 : typeof rawVal === "number" ? rawVal : rawVal.toNumber();
  return {
    id: d.id,
    title: d.title,
    value: numVal,
    ownerId: d.ownerId ?? null,
    quadrant: ((m["eisenhower"] as EisenhowerQuadrant) ?? "Q4_ELIMINATE"),
    phase: (m["currentPhase"] as string) ?? "",
    paymentDeadline: (m["paymentDeadline"] as string) ?? null,
    contactName: d.contact?.name ?? null,
    uf: (m["uf"] as string) ?? null,
    updatedAt: d.updatedAt.toISOString(),
  };
}

// ── Query ──────────────────────────────────────────────────────────────────────

export async function fetchEisenhowerDeals(
  workspaceId: string,
): Promise<DealCardData[]> {
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
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rawDeals.map(mapDealCard);
}
