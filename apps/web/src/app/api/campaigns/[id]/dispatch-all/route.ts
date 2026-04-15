/**
 * POST /api/campaigns/[id]/dispatch-all — re-enfileira todos os items PENDING/ERROR.
 * [SEC-03] workspaceId · [SEC-06] CAMPAIGN_DISPATCH_ALL
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import {
  enqueueCampaignDispatchJobs,
  computeJobDelays,
} from "@flow-os/brain/workers/campaign-dispatcher";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspaceId } = session;
    const { id: campaignId } = await params;

    const campaign = await db.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true, status: true, ratePerHour: true, startedAt: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    }

    if (campaign.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Campanha cancelada não pode ser disparada" },
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

    const dispatchableStatuses = ["PENDING", "ERROR", "SKIPPED"] as const;

    const pendingItems = await db.campaignItem.findMany({
      where: {
        campaignId,
        workspaceId,
        status: { in: [...dispatchableStatuses] },
      },
      select: { id: true },
    });

    if (pendingItems.length === 0) {
      return NextResponse.json(
        { ok: true, message: "Nenhum item pendente para disparar", count: 0 },
      );
    }

    await db.campaignItem.updateMany({
      where: {
        campaignId,
        workspaceId,
        status: { in: ["ERROR", "SKIPPED"] },
      },
      data: { status: "PENDING", completedAt: null, error: null },
    });

    await db.campaign.update({
      where: { id: campaignId, workspaceId },
      data: {
        status: "RUNNING",
        startedAt: campaign.startedAt ?? new Date(),
      },
    });

    const ratePerHour = campaign.ratePerHour ?? 20;
    const delays = computeJobDelays(ratePerHour, pendingItems.length);
    const jobs = pendingItems.map((item, i) => ({
      campaignItemId: item.id,
      campaignId,
      workspaceId,
      delayMs: delays[i] ?? 0,
    }));

    await enqueueCampaignDispatchJobs(redisUrl, jobs);

    await appendAuditLog({
      workspaceId,
      action: "CAMPAIGN_DISPATCH_ALL",
      input: { campaignId, manual: true },
      output: { itemsEnqueued: pendingItems.length },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, count: pendingItems.length });
  } catch (err) {
    console.error("[dispatch-all]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
