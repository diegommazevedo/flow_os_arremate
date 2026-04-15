/**
 * POST /api/campaigns/[id]/restart — reprocessar items PENDING/ERROR.
 * [SEC-03] workspaceId · [SEC-06] CAMPAIGN_RESTARTED
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { computeJobDelays } from "@flow-os/brain/workers/campaign-dispatcher";
import { tryEnqueueCampaignDispatchJobs } from "@/lib/campaign-queue-enqueue";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;
  const { id } = await params;

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId },
    select: { id: true, status: true, ratePerHour: true, startedAt: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  if (campaign.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Campanha cancelada não pode ser reiniciada" },
      { status: 409 },
    );
  }

  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    return NextResponse.json(
      { error: "REDIS_URL não configurada — necessária para enfileirar campanha" },
      { status: 503 },
    );
  }

  // Reset items that are PENDING or ERROR for reprocessing
  const itemsToReset = await db.campaignItem.findMany({
    where: {
      campaignId: id,
      workspaceId,
      status: { in: ["PENDING", "ERROR", "SKIPPED"] },
    },
    select: { id: true },
  });

  if (itemsToReset.length === 0) {
    return NextResponse.json(
      { error: "Nenhum item pendente ou com erro para reprocessar" },
      { status: 409 },
    );
  }

  await db.campaignItem.updateMany({
    where: {
      campaignId: id,
      workspaceId,
      status: { in: ["PENDING", "ERROR", "SKIPPED"] },
    },
    data: { status: "PENDING", completedAt: null, error: null },
  });

  // Update campaign status to RUNNING
  const updated = await db.campaign.update({
    where: { id, workspaceId },
    data: {
      status: "RUNNING",
      startedAt: campaign.startedAt ?? new Date(),
    },
    select: { id: true, status: true, name: true },
  });

  // Enqueue jobs for the reset items
  const ratePerHour = campaign.ratePerHour ?? 20;
  const delays = computeJobDelays(ratePerHour, itemsToReset.length);
  const jobs = itemsToReset.map((item, i) => ({
    campaignItemId: item.id,
    campaignId: id,
    workspaceId,
    delayMs: delays[i] ?? 0,
  }));

  const enqueued = await tryEnqueueCampaignDispatchJobs(redisUrl, jobs, "campaign-restart");
  if (!enqueued.ok) {
    return NextResponse.json(
      {
        error: "Fila indisponível (Redis). Verifique REDIS_URL e rede.",
        code: "QUEUE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  await appendAuditLog({
    workspaceId,
    action: "CAMPAIGN_RESTARTED",
    input: { campaignId: id },
    output: { itemsReset: itemsToReset.length },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    campaign: updated,
    itemsReset: itemsToReset.length,
  });
}
