/**
 * GET /api/campaigns/[id] — snapshot para monitor (polling / SSE).
 * PATCH /api/campaigns/[id] — status PAUSED | RUNNING | CANCELLED
 * [SEC-03] workspaceId da sessão · [SEC-06] CAMPAIGN_STATUS_CHANGED
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { CampaignStatus } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId },
    include: {
      _count: { select: { items: true } },
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  }

  const items = await db.campaignItem.findMany({
    where: { workspaceId, campaignId: id },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      deal: {
        select: {
          id: true,
          meta: true,
          propertyDossier: {
            select: { status: true, fieldScore: true, reportUrl: true, sharedWithLead: true },
          },
          fieldAssignments: {
            where: { workspaceId },
            take: 3,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              evidenceCount: true,
              agent: { select: { partner: { select: { name: true } } } },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
    take: 500,
  });

  const dealIds = [...new Set(items.map((i) => i.dealId).filter(Boolean))] as string[];

  const emptyCounts = {
    evidenceTotal: 0,
    motoboyContacted: 0,
    motoboyAccepted: 0,
    dossierGenerated: 0,
    dossierShared: 0,
  };

  const metrics =
    dealIds.length === 0
      ? emptyCounts
      : {
          evidenceTotal: await db.fieldEvidence.count({
            where: { workspaceId, dealId: { in: dealIds } },
          }),
          motoboyContacted: await db.fieldAssignment.count({
            where: {
              workspaceId,
              dealId: { in: dealIds },
              status: { notIn: ["PENDING_CONTACT", "CANCELLED"] },
            },
          }),
          motoboyAccepted: await db.fieldAssignment.count({
            where: {
              workspaceId,
              dealId: { in: dealIds },
              status: { in: ["ACCEPTED", "IN_PROGRESS", "COMPLETED"] },
            },
          }),
          dossierGenerated: await db.propertyDossier.count({
            where: {
              workspaceId,
              dealId: { in: dealIds },
              status: { in: ["GENERATED", "SHARED"] },
            },
          }),
          dossierShared: await db.propertyDossier.count({
            where: {
              workspaceId,
              dealId: { in: dealIds },
              sharedWithLead: true,
            },
          }),
        };

  const { evidenceTotal, motoboyContacted, motoboyAccepted, dossierGenerated, dossierShared } =
    metrics;

  function itemUiStatus(row: (typeof items)[0]): string {
    const st = row.status;
    if (st === "ERROR") return "erro";
    if (st === "PENDING") return "aguardando_motoboy";
    if (st === "RUNNING") return "processando";
    const dossier = row.deal?.propertyDossier;
    const fa = row.deal?.fieldAssignments?.[0];
    if (dossier?.status === "SHARED" || dossier?.sharedWithLead) return "enviado_lead";
    if (dossier?.status === "GENERATED") return "pdf_pronto";
    if (dossier?.status === "FIELD_PENDING" || dossier?.status === "DRAFT") {
      if (fa?.status === "IN_PROGRESS" || (fa?.evidenceCount ?? 0) > 0) return "coletando_evidencias";
      if (fa?.status === "ACCEPTED") return "motoboy_aceitou";
      if (fa?.status === "CONTACTED") return "motoboy_acionado";
    }
    if (st === "DONE") return "concluido";
    return "desconhecido";
  }

  const rows = items.map((row) => {
    const meta = (row.deal?.meta ?? {}) as Record<string, unknown>;
    const end = String(meta["imovelEndereco"] ?? meta["endereco"] ?? "—").slice(0, 48);
    const fa = row.deal?.fieldAssignments?.[0];
    return {
      id: row.id,
      contactName: row.contact.name,
      imovel: end,
      motoboyName: fa?.agent?.partner?.name ?? null,
      itemStatus: row.status,
      uiStatus: itemUiStatus(row),
      dossierStatus: row.deal?.propertyDossier?.status ?? null,
      evidenceCount: fa?.evidenceCount ?? 0,
      score: row.deal?.propertyDossier?.fieldScore
        ? Number(row.deal.propertyDossier.fieldScore)
        : null,
      reportUrl: row.deal?.propertyDossier?.reportUrl ?? null,
      error: row.error,
    };
  });

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      totalLeads: campaign.totalLeads,
      sentCount: campaign.sentCount,
      doneCount: campaign.doneCount,
      startedAt: campaign.startedAt?.toISOString() ?? null,
    },
    metrics: {
      motoboyContacted,
      motoboyAccepted,
      evidences: evidenceTotal,
      dossierGenerated,
      dossierShared,
    },
    items: rows,
  });
}

const PATCH_STATUSES: CampaignStatus[] = ["PAUSED", "RUNNING", "CANCELLED"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    status?: string;
    action?: string;
  } | null;

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId },
    select: { id: true, status: true, name: true, archivedAt: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  }

  // Handle archive/unarchive actions
  if (body?.action === "archive") {
    if (!["COMPLETED", "CANCELLED"].includes(campaign.status)) {
      return NextResponse.json(
        { error: "Só é possível arquivar campanhas concluídas ou canceladas" },
        { status: 409 },
      );
    }
    const updated = await db.campaign.update({
      where: { id, workspaceId },
      data: { archivedAt: new Date() },
      select: { id: true, status: true, name: true, archivedAt: true },
    });
    await appendAuditLog({
      workspaceId,
      action: "CAMPAIGN_ARCHIVED",
      input: { campaignId: id },
      output: { archivedAt: updated.archivedAt?.toISOString() ?? null },
    }).catch(() => undefined);
    return NextResponse.json(updated);
  }

  if (body?.action === "unarchive") {
    const updated = await db.campaign.update({
      where: { id, workspaceId },
      data: { archivedAt: null },
      select: { id: true, status: true, name: true, archivedAt: true },
    });
    await appendAuditLog({
      workspaceId,
      action: "CAMPAIGN_UNARCHIVED",
      input: { campaignId: id },
      output: {},
    }).catch(() => undefined);
    return NextResponse.json(updated);
  }

  // Handle status change
  const raw = body?.status;
  if (!raw || !PATCH_STATUSES.includes(raw as CampaignStatus)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }
  const nextStatus = raw as CampaignStatus;

  if (campaign.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Campanha cancelada não pode ser alterada" },
      { status: 409 },
    );
  }

  const updated = await db.campaign.update({
    where: { id, workspaceId },
    data: { status: nextStatus },
    select: { id: true, status: true, name: true },
  });

  await appendAuditLog({
    workspaceId,
    action: "CAMPAIGN_STATUS_CHANGED",
    input: { campaignId: id, from: campaign.status, to: nextStatus },
    output: { status: updated.status },
  }).catch(() => undefined);

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId },
    select: { id: true, status: true, name: true, archivedAt: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  }

  // Only allow delete if archived, CANCELLED, or DRAFT
  if (!campaign.archivedAt && !["CANCELLED", "DRAFT"].includes(campaign.status)) {
    return NextResponse.json(
      { error: "Arquive a campanha antes de excluir, ou cancele-a primeiro" },
      { status: 409 },
    );
  }

  // Delete items first (FK constraint)
  await db.campaignItem.deleteMany({ where: { campaignId: id, workspaceId } });
  await db.campaign.delete({ where: { id, workspaceId } });

  await appendAuditLog({
    workspaceId,
    action: "CAMPAIGN_DELETED",
    input: { campaignId: id, name: campaign.name },
    output: {},
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
