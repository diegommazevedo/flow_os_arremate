/**
 * POST /api/vistoria/[token]/submit — finalizar vistoria
 * Rota pública — sem sessão, autenticada por pwaAccessToken.
 * [SEC-06] AuditLog: VISTORIA_SUBMITTED + PAYMENT_ORDER_CREATED.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";

type Params = { params: Promise<{ token: string }> };

interface SkippedItem {
  itemId: string;
  reason: string;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    include: {
      profile: true,
      agent: {
        select: {
          id: true,
          pixKey: true,
          pixKeyType: true,
          pricePerVisit: true,
        },
      },
      evidences: { select: { id: true, type: true, description: true } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  const assignMeta = (assignment.meta ?? {}) as Record<string, unknown>;
  if (assignMeta["confirmLocked"] === true) {
    return NextResponse.json({ error: "Link bloqueado" }, { status: 403 });
  }

  if (assignment.status === "COMPLETED") {
    return NextResponse.json({ error: "Vistoria já enviada" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    gps?: { lat: number; lng: number; accuracy: number };
    skippedItems?: SkippedItem[];
    pixPendente?: boolean;
  } | null;

  if (!body?.gps || typeof body.gps.lat !== "number" || typeof body.gps.lng !== "number") {
    return NextResponse.json({ error: "GPS obrigatório para concluir" }, { status: 400 });
  }

  const profile = assignment.profile;
  const items = (profile?.items ?? []) as Array<{
    id: string; label: string; required: boolean; enabled: boolean;
    baseValue: number; bonusValue: number;
  }>;

  const evidenceItemIds = assignment.evidences.map(e => e.description).filter(Boolean) as string[];
  const descricaoTexto = typeof assignMeta["descricaoTexto"] === "string" ? assignMeta["descricaoTexto"] : "";
  const itemStates = (assignMeta["itemStates"] as Record<string, { status?: string }> | undefined) ?? {};

  const skippedIds = new Set((body.skippedItems ?? []).map(s => s.itemId));
  for (const [itemId, st] of Object.entries(itemStates)) {
    if (st?.status === "skipped") skippedIds.add(itemId);
  }

  const itemSatisfied = (itemId: string): boolean => {
    if (evidenceItemIds.includes(itemId)) return true;
    if (itemId === "text" && descricaoTexto.trim().length > 0) return true;
    return false;
  };

  const requiredDone = items
    .filter(i => i.required && i.enabled)
    .every(i => itemSatisfied(i.id));

  if (!requiredDone || !profile) {
    return NextResponse.json({ error: "Bandeirada incompleta" }, { status: 400 });
  }

  const breakdown: Array<{ itemId: string; label: string; value: number; status: string }> = [];
  let total = profile.bandeiradaValue;
  breakdown.push({ itemId: "_bandeirada", label: "Bandeirada", value: profile.bandeiradaValue, status: "base" });

  const skippedList = [...skippedIds];
  for (const item of items.filter(i => !i.required && i.enabled)) {
    if (evidenceItemIds.includes(item.id)) {
      const itemValue = item.baseValue + item.bonusValue;
      total += itemValue;
      breakdown.push({ itemId: item.id, label: item.label, value: itemValue, status: "done" });
    } else if (skippedList.includes(item.id)) {
      breakdown.push({ itemId: item.id, label: item.label, value: 0, status: "skipped" });
    }
  }

  if (total > profile.maxValue) total = profile.maxValue;

  const pixPendente = body.pixPendente === true;

  await db.fieldAssignment.update({
    where: { id: assignment.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      meta: {
        ...assignMeta,
        pixPendente,
        submitGps: body.gps,
      } as object,
    },
  });

  // 2. Criar PaymentOrder (se ainda não existe)
  const existingPayment = await db.paymentOrder.findFirst({
    where: { assignmentId: assignment.id },
  });

  let paymentOrderId: string | null = null;
  if (!existingPayment && !pixPendente && assignment.agent.pixKey && assignment.agent.pixKeyType) {
    const po = await db.paymentOrder.create({
      data: {
        workspaceId: assignment.workspaceId,
        assignmentId: assignment.id,
        agentId: assignment.agent.id,
        amount: total,
        pixKey: assignment.agent.pixKey,
        pixKeyType: assignment.agent.pixKeyType,
        status: "PENDING",
        breakdown: breakdown as object[],
      },
    });
    paymentOrderId = po.id;
  }

  // 3. AuditLog [SEC-06]
  const auditAgent = await db.agent.findFirst({
    where: { workspaceId: assignment.workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (auditAgent) {
    await db.agentAuditLog.createMany({
      data: [
        {
          workspaceId: assignment.workspaceId,
          agentId: auditAgent.id,
          action: "VISTORIA_SUBMITTED",
          input: {
            assignmentId: assignment.id,
            evidenceCount: assignment.evidences.length,
            skippedCount: skippedList.length,
          } as Record<string, string | number | boolean>,
          output: {
            paymentTotal: total,
            paymentOrderId: paymentOrderId ?? "none",
          } as Record<string, string | number | boolean>,
          modelUsed: "none",
          tokensUsed: 0,
          costUsd: 0,
          durationMs: 0,
          success: true,
        },
        ...(paymentOrderId
          ? [{
              workspaceId: assignment.workspaceId,
              agentId: auditAgent.id,
              action: "PAYMENT_ORDER_CREATED",
              input: {
                assignmentId: assignment.id,
                agentId: assignment.agent.id,
              } as Record<string, string | number | boolean>,
              output: {
                paymentOrderId,
                amount: total,
              } as Record<string, string | number | boolean>,
              modelUsed: "none" as const,
              tokensUsed: 0,
              costUsd: 0,
              durationMs: 0,
              success: true,
            }]
          : []),
      ],
    });
  }

  // 4. Atualizar PropertyDossier status → FIELD_COMPLETE
  await db.propertyDossier.updateMany({
    where: { dealId: assignment.dealId, workspaceId: assignment.workspaceId },
    data: { status: "FIELD_COMPLETE" },
  });

  return NextResponse.json({
    ok: true,
    payment: { total, breakdown },
    pixPendente,
  });
}
