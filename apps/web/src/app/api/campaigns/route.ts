/**
 * GET/POST /api/campaigns
 * [SEC-03] workspaceId · [SEC-06] CAMPAIGN_CREATED
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { CampaignType } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { ensureOpenDealForContact } from "@/lib/lead-deal";
import {
  enqueueCampaignDispatchJobs,
  computeJobDelays,
} from "@flow-os/brain/workers/campaign-dispatcher";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;

  const list = await db.campaign.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      _count: { select: { items: true } },
    },
  });

  const items = await Promise.all(
    list.map(async (c) => {
      const ci = await db.campaignItem.findMany({
        where: { workspaceId, campaignId: c.id },
        select: { dealId: true },
      });
      const dealIds = [...new Set(ci.map((x) => x.dealId).filter(Boolean))] as string[];
      const dossierReady =
        dealIds.length === 0
          ? 0
          : await db.propertyDossier.count({
              where: {
                workspaceId,
                dealId: { in: dealIds },
                status: { in: ["GENERATED", "SHARED"] },
              },
            });
      const pct = c.totalLeads > 0 ? Math.round((c.doneCount / c.totalLeads) * 100) : 0;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        totalLeads: c.totalLeads,
        sentCount: c.sentCount,
        doneCount: c.doneCount,
        ratePerHour: c.ratePerHour,
        dossierReady,
        progressPct: pct,
        updatedAt: c.updatedAt.toISOString(),
      };
    }),
  );

  return NextResponse.json({ campaigns: items });
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    type?: CampaignType;
    contactIds?: string[];
    ratePerHour?: number;
    startImmediately?: boolean;
    saveDraft?: boolean;
    waMessage?: string;
  } | null;

  const name = (body?.name ?? "").trim().slice(0, 120);
  const type = body?.type ?? "DOSSIER";
  const contactIds = Array.isArray(body?.contactIds) ? [...new Set(body.contactIds)] : [];
  const ratePerHour = Math.max(1, Math.min(500, Number(body?.ratePerHour) || 20));
  const startImmediately = Boolean(body?.startImmediately) && !body?.saveDraft;
  const waMessage = (body?.waMessage ?? "").trim().slice(0, 4096);

  if (!name) {
    return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
  }
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds obrigatório" }, { status: 400 });
  }
  if (type === "WA_MESSAGE" && !waMessage) {
    return NextResponse.json({ error: "waMessage obrigatório para WA_MESSAGE" }, { status: 400 });
  }

  const redisUrl = process.env["REDIS_URL"];
  if (startImmediately && !redisUrl) {
    return NextResponse.json(
      { error: "REDIS_URL não configurada — necessária para enfileirar campanha" },
      { status: 503 },
    );
  }

  const meta =
    type === "WA_MESSAGE"
      ? { waMessage }
      : type === "DOSSIER"
        ? { pipeline: "motoboy_dossier" }
        : {};

  const status = startImmediately ? "RUNNING" : "DRAFT";

  const campaign = await db.campaign.create({
    data: {
      workspaceId,
      name,
      type,
      status,
      totalLeads: contactIds.length,
      ratePerHour,
      startedAt: startImmediately ? new Date() : null,
      meta: meta as object,
    },
    select: { id: true },
  });

  const validContactIds: string[] = [];
  for (const contactId of contactIds) {
    const contact = await db.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (contact) validContactIds.push(contactId);
  }

  await db.campaign.update({
    where: { id: campaign.id, workspaceId },
    data: { totalLeads: validContactIds.length },
  });

  const delays = computeJobDelays(ratePerHour, validContactIds.length);
  const jobs: Array<{
    campaignItemId: string;
    campaignId: string;
    workspaceId: string;
    delayMs: number;
  }> = [];

  for (let i = 0; i < validContactIds.length; i++) {
    const contactId = validContactIds[i]!;
    const dealId = await ensureOpenDealForContact(workspaceId, contactId, {}, undefined);

    const item = await db.campaignItem.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        contactId,
        dealId,
      },
      select: { id: true },
    });

    if (startImmediately) {
      jobs.push({
        campaignItemId: item.id,
        campaignId: campaign.id,
        workspaceId,
        delayMs: delays[i] ?? 0,
      });
    }
  }

  if (startImmediately && jobs.length > 0 && redisUrl) {
    await enqueueCampaignDispatchJobs(redisUrl, jobs);
  }

  await appendAuditLog({
    workspaceId,
    action: "CAMPAIGN_CREATED",
    input: { campaignId: campaign.id, name, type, leads: contactIds.length, startImmediately },
    output: { itemsQueued: jobs.length },
  }).catch(() => undefined);

  return NextResponse.json({
    id: campaign.id,
    status,
    itemsCreated: jobs.length || contactIds.length,
  });
}
