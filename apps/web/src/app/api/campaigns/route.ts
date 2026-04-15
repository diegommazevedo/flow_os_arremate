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
import { computeJobDelays } from "@flow-os/brain/workers/campaign-dispatcher";
import { tryEnqueueCampaignDispatchJobs } from "@/lib/campaign-queue-enqueue";

export async function GET(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";

  const list = await db.campaign.findMany({
    where: {
      workspaceId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
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
        archivedAt: c.archivedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
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
    segmentFilter?: {
      stageIds?: string[];
      tipos?: string[];
      ufs?: string[];
    };
    ratePerHour?: number;
    startImmediately?: boolean;
    saveDraft?: boolean;
    waMessage?: string;
  } | null;

  const name = (body?.name ?? "").trim().slice(0, 120);
  const type = body?.type ?? "DOSSIER";
  let contactIds = Array.isArray(body?.contactIds) ? [...new Set(body.contactIds)] : [];
  const segmentFilter = body?.segmentFilter ?? null;
  const ratePerHour = Math.max(1, Math.min(500, Number(body?.ratePerHour) || 20));
  const startImmediately = Boolean(body?.startImmediately) && !body?.saveDraft;
  const waMessage = (body?.waMessage ?? "").trim().slice(0, 4096);

  if (!name) {
    return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
  }

  // If segmentFilter is provided, resolve contactIds from filter
  if (segmentFilter && (
    (segmentFilter.stageIds?.length ?? 0) > 0 ||
    (segmentFilter.tipos?.length ?? 0) > 0 ||
    (segmentFilter.ufs?.length ?? 0) > 0
  )) {
    const stageIds = segmentFilter.stageIds ?? [];
    const tipos = (segmentFilter.tipos ?? []).map((t) => t.toLowerCase());
    const ufs = (segmentFilter.ufs ?? []).map((u) => u.toUpperCase());

    const dealWhere: import("@flow-os/db").Prisma.DealWhereInput = {
      workspaceId,
      closedAt: null,
      contactId: { not: null },
    };
    if (stageIds.length > 0) {
      dealWhere.stageId = { in: stageIds };
    }

    const deals = await db.deal.findMany({
      where: dealWhere,
      select: { contactId: true, meta: true },
      take: 10000,
    });

    const resolved = new Set<string>();
    for (const deal of deals) {
      const meta = (deal.meta ?? {}) as Record<string, unknown>;
      if (tipos.length > 0) {
        const dealTipo = String(meta["tipoPagamento"] ?? meta["tipo_pagamento"] ?? "").toLowerCase();
        if (!tipos.includes(dealTipo)) continue;
      }
      if (ufs.length > 0) {
        const dealUf = String(meta["imovelUF"] ?? meta["uf"] ?? "").toUpperCase();
        if (!ufs.includes(dealUf)) continue;
      }
      if (deal.contactId) resolved.add(deal.contactId);
    }
    contactIds = [...resolved];
  }

  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds obrigatório" }, { status: 400 });
  }
  if (type === "WA_MESSAGE" && !waMessage) {
    return NextResponse.json({ error: "waMessage obrigatório para WA_MESSAGE" }, { status: 400 });
  }

  const existing = await db.campaign.findFirst({
    where: { workspaceId, name },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Já existe uma campanha com este nome." }, { status: 409 });
  }

  const redisUrl = process.env["REDIS_URL"];
  if (startImmediately && !redisUrl) {
    return NextResponse.json(
      { error: "REDIS_URL não configurada — necessária para enfileirar campanha" },
      { status: 503 },
    );
  }

  const meta: Record<string, unknown> =
    type === "WA_MESSAGE"
      ? { waMessage }
      : type === "DOSSIER"
        ? { pipeline: "motoboy_dossier" }
        : {};

  if (segmentFilter) {
    meta["segmentFilter"] = segmentFilter;
  }

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
    const enqueued = await tryEnqueueCampaignDispatchJobs(redisUrl, jobs, "campaigns-post");
    if (!enqueued.ok) {
      return NextResponse.json(
        {
          id: campaign.id,
          status,
          itemsCreated: jobs.length,
          error:
            "Campanha criada, mas a fila Redis falhou ao enfileirar. Configure REDIS_URL ou use Disparar quando a fila estiver disponível.",
          code: "QUEUE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }
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
