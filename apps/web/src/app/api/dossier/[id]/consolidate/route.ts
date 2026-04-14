/**
 * POST — pedido de consolidação (SEC-03, SEC-06).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { consolidateDossier, enqueueDossierConsolidation } from "@flow-os/brain/workers/dossier-consolidator";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: dossierId } = await params;

  const dossier = await db.propertyDossier.findFirst({
    where: { id: dossierId, workspaceId },
    select: { id: true },
  });
  if (!dossier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const force = Boolean(body["force"]);

  await appendAuditLog({
    workspaceId,
    action: "DOSSIER_CONSOLIDATION_REQUESTED",
    input: { dossierId, force } as Prisma.InputJsonObject,
    output: { queued: !force } as Prisma.InputJsonObject,
  }).catch(() => undefined);

  if (force) {
    const r = await consolidateDossier(dossierId, workspaceId, { force: true });
    if (!r.ok) return NextResponse.json({ error: r.error ?? "Falha" }, { status: 400 });
    return NextResponse.json({ ok: true, mode: "sync" });
  }

  await enqueueDossierConsolidation(
    { dossierId, workspaceId, force: false },
    { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" },
  );
  return NextResponse.json({ ok: true, mode: "queued" });
}
