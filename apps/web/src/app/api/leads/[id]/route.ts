/**
 * GET /api/leads/[id] — perfil do lead (contato, deals, dossiê, campanhas).
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const contact = await db.contact.findFirst({
    where: { id, workspaceId },
    include: {
      contactTags: { include: { tag: true } },
      deals: {
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          propertyDossier: true,
        },
      },
      campaignItems: {
        where: { workspaceId },
        take: 50,
        orderBy: { id: "desc" },
        include: { campaign: { select: { id: true, name: true, status: true, type: true } } },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const dealIds = contact.deals.map((d) => d.id);
  const evidencesByDeal =
    dealIds.length === 0
      ? []
      : await db.fieldEvidence.findMany({
          where: { workspaceId, dealId: { in: dealIds } },
          orderBy: { capturedAt: "desc" },
          take: 60,
        });

  const tasks = await db.task.findMany({
    where: {
      workspaceId,
      dealId: { in: contact.deals.map((d) => d.id) },
      channel: { in: ["WA_EVOLUTION", "WA", "WA_GROUP"] },
      completedAt: null,
    },
    take: 5,
    select: { id: true, dealId: true },
  });

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      document: contact.document,
      leadLifecycle: contact.leadLifecycle,
      createdAt: contact.createdAt,
      tags: contact.contactTags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color,
      })),
    },
    deals: contact.deals.map((d) => ({
      id: d.id,
      title: d.title,
      meta: d.meta,
      dossier: d.propertyDossier,
      evidences: evidencesByDeal
        .filter((e) => e.dealId === d.id)
        .slice(0, 12)
        .map((e) => ({
          id: e.id,
          type: e.type,
          mediaUrl: e.mediaUrl,
          mimeType: e.mimeType,
        })),
    })),
    campaignItems: contact.campaignItems.map((ci) => ({
      id: ci.id,
      status: ci.status,
      campaign: ci.campaign,
    })),
    chatTaskIds: tasks.map((t) => t.id),
  });
}
