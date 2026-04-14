/**
 * GET — PropertyDossier + DossierChecklist para o deal (SEC-03).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: dealId } = await params;

  const dossier = await db.propertyDossier.findFirst({
    where: { dealId, workspaceId },
    include: { checklist: true },
  });
  if (!dossier) {
    return NextResponse.json({ dossier: null, checklist: null });
  }

  return NextResponse.json({
    dossier,
    checklist: dossier.checklist,
  });
}
