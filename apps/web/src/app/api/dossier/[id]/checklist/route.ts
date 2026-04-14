/**
 * GET — checklist completo do dossier (SEC-03).
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
  const { id: dossierId } = await params;

  const dossier = await db.propertyDossier.findFirst({
    where: { id: dossierId, workspaceId },
    select: { id: true },
  });
  if (!dossier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const checklist = await db.dossierChecklist.findUnique({
    where: { dossierId },
  });
  return NextResponse.json({ checklist });
}
