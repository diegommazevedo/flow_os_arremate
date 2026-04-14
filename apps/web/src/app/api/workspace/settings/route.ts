/**
 * GET / PATCH — Workspace.settings (P-02) — subset dossiê.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ws = await db.workspace.findFirst({
    where: { id: workspaceId },
    select: { settings: true },
  });
  return NextResponse.json({ settings: ws?.settings ?? {} });
}

export async function PATCH(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patch = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const current = await db.workspace.findFirst({
    where: { id: workspaceId },
    select: { settings: true },
  });
  const base = (current?.settings ?? {}) as Record<string, unknown>;
  const dossier = { ...(typeof base["dossier"] === "object" && base["dossier"] ? (base["dossier"] as object) : {}) };

  if ("autoDispatchDossier" in patch) (dossier as Record<string, unknown>)["autoDispatchDossier"] = Boolean(patch["autoDispatchDossier"]);
  if ("autoDispatchDelayMinutes" in patch && typeof patch["autoDispatchDelayMinutes"] === "number") {
    (dossier as Record<string, unknown>)["autoDispatchDelayMinutes"] = patch["autoDispatchDelayMinutes"];
  }
  if ("gateATimeoutHours" in patch && typeof patch["gateATimeoutHours"] === "number") {
    (dossier as Record<string, unknown>)["gateATimeoutHours"] = patch["gateATimeoutHours"];
  }
  if ("gateBTimeoutHours" in patch && typeof patch["gateBTimeoutHours"] === "number") {
    (dossier as Record<string, unknown>)["gateBTimeoutHours"] = patch["gateBTimeoutHours"];
  }
  if ("reportFooterText" in patch && typeof patch["reportFooterText"] === "string") {
    (dossier as Record<string, unknown>)["reportFooterText"] = patch["reportFooterText"].slice(0, 2000);
  }

  const nextSettings = { ...base, dossier } as Prisma.InputJsonValue;

  await db.workspace.update({
    where: { id: workspaceId },
    data: { settings: nextSettings },
  });

  return NextResponse.json({ ok: true });
}
