/**
 * GET/PUT/DELETE /api/mission-profiles/[id]
 * [SEC-03] workspaceId
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const profile = await db.missionProfile.findFirst({
    where: { id, workspaceId },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await db.missionProfile.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const nameRaw = body["name"] != null ? String(body["name"]).trim().slice(0, 120) : existing.name;
  if (nameRaw !== existing.name) {
    const dup = await db.missionProfile.findFirst({
      where: { workspaceId, name: nameRaw, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ error: "Já existe um perfil com este nome." }, { status: 409 });
    }
  }

  const isDefault = body["isDefault"] != null ? Boolean(body["isDefault"]) : existing.isDefault;

  const updated = await db.$transaction(async (tx) => {
    if (isDefault && !existing.isDefault) {
      await tx.missionProfile.updateMany({
        where: { workspaceId },
        data: { isDefault: false },
      });
    }
    return tx.missionProfile.update({
      where: { id, workspaceId },
      data: {
        name: nameRaw,
        description:
          body["description"] === undefined
            ? existing.description
            : body["description"]
              ? String(body["description"]).slice(0, 2000)
              : null,
        level:
          body["level"] === "DOWN" || body["level"] === "STANDARD" || body["level"] === "UP"
            ? (body["level"] as "DOWN" | "STANDARD" | "UP")
            : existing.level,
        bandeiradaValue:
          body["bandeiradaValue"] !== undefined
            ? Math.max(0, Number(body["bandeiradaValue"]))
            : existing.bandeiradaValue,
        maxValue: body["maxValue"] !== undefined ? Math.max(0, Number(body["maxValue"])) : existing.maxValue,
        currency:
          body["currency"] !== undefined ? String(body["currency"]).slice(0, 8) : existing.currency,
        items: (body["items"] !== undefined ? body["items"] : existing.items) as Prisma.InputJsonValue,
        skipPenalty: body["skipPenalty"] !== undefined ? Boolean(body["skipPenalty"]) : existing.skipPenalty,
        skipRequiresText:
          body["skipRequiresText"] !== undefined ? Boolean(body["skipRequiresText"]) : existing.skipRequiresText,
        skipMinChars:
          body["skipMinChars"] !== undefined ? Math.max(0, Number(body["skipMinChars"])) : existing.skipMinChars,
        skipMaxItems:
          body["skipMaxItems"] !== undefined ? Math.max(0, Number(body["skipMaxItems"])) : existing.skipMaxItems,
        skipReasons:
          body["skipReasons"] !== undefined && Array.isArray(body["skipReasons"])
            ? (body["skipReasons"] as string[]).map((s) => String(s).slice(0, 200))
            : existing.skipReasons,
        agentLimit:
          body["agentLimit"] !== undefined ? Math.max(1, Number(body["agentLimit"])) : existing.agentLimit,
        followupDelayMs:
          body["followupDelayMs"] !== undefined
            ? Math.max(60_000, Number(body["followupDelayMs"]))
            : existing.followupDelayMs,
        deadlineHours:
          body["deadlineHours"] !== undefined
            ? Math.max(1, Number(body["deadlineHours"]))
            : existing.deadlineHours,
        autoSelectRules:
          (body["autoSelectRules"] !== undefined ? body["autoSelectRules"] : existing.autoSelectRules) as Prisma.InputJsonValue,
        isActive: body["isActive"] !== undefined ? Boolean(body["isActive"]) : existing.isActive,
        isDefault,
      },
    });
  });

  await appendAuditLog({
    workspaceId,
    action: "MISSION_PROFILE_UPDATED",
    input: { profileId: id },
    output: { name: updated.name },
  }).catch(() => undefined);

  return NextResponse.json({ profile: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await db.missionProfile.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isDefault) {
    return NextResponse.json({ error: "Não é permitido excluir o perfil padrão." }, { status: 400 });
  }

  const inUse = await db.fieldAssignment.count({
    where: { workspaceId, profileId: id },
  });
  if (inUse > 0) {
    return NextResponse.json(
      { error: "Perfil em uso em assignments — remova vínculos antes." },
      { status: 409 },
    );
  }

  await db.missionProfile.delete({ where: { id, workspaceId } });

  await appendAuditLog({
    workspaceId,
    action: "MISSION_PROFILE_DELETED",
    input: { profileId: id, name: existing.name },
    output: { ok: true },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
