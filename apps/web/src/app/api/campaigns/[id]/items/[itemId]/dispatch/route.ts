/**
 * POST /api/campaigns/[id]/items/[itemId]/dispatch — disparar item individual.
 * [SEC-03] workspaceId · [SEC-06] CAMPAIGN_ITEM_DISPATCHED
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { enqueueCampaignDispatchJobs } from "@flow-os/brain/workers/campaign-dispatcher";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;
  const { id: campaignId, itemId } = await params;

  const item = await db.campaignItem.findFirst({
    where: {
      id: itemId,
      campaignId,
      workspaceId,
    },
    select: { id: true, status: true },
  });

  if (!item) {
    return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  }

  if (!["PENDING", "ERROR"].includes(item.status)) {
    return NextResponse.json(
      { error: `Item com status ${item.status} não pode ser redisparado` },
      { status: 409 },
    );
  }

  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    return NextResponse.json(
      { error: "REDIS_URL não configurada" },
      { status: 503 },
    );
  }

  // Reset item to PENDING if ERROR
  if (item.status === "ERROR") {
    await db.campaignItem.update({
      where: { id: itemId, workspaceId },
      data: { status: "PENDING", completedAt: null, error: null },
    });
  }

  // Ensure campaign is RUNNING
  await db.campaign.update({
    where: { id: campaignId, workspaceId },
    data: { status: "RUNNING" },
  });

  // Enqueue single item
  await enqueueCampaignDispatchJobs(redisUrl, [
    {
      campaignItemId: itemId,
      campaignId,
      workspaceId,
      delayMs: 0,
    },
  ]);

  await appendAuditLog({
    workspaceId,
    action: "CAMPAIGN_ITEM_DISPATCHED",
    input: { campaignId, itemId, manual: true },
    output: { status: "enqueued" },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
