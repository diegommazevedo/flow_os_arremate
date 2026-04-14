/**
 * GET/POST /api/mission-profiles
 * [SEC-03] workspaceId · [SEC-06] audit em mutações
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

export async function GET() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db.missionProfile.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ profiles: items });
}

export async function POST(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
    level?: "DOWN" | "STANDARD" | "UP";
    bandeiradaValue?: number;
    maxValue?: number;
    currency?: string;
    items?: unknown;
    skipPenalty?: boolean;
    skipRequiresText?: boolean;
    skipMinChars?: number;
    skipMaxItems?: number;
    skipReasons?: string[];
    agentLimit?: number;
    followupDelayMs?: number;
    deadlineHours?: number;
    autoSelectRules?: unknown;
    isDefault?: boolean;
  } | null;

  const name = (body?.name ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "name obrigatório" }, { status: 400 });

  const dup = await db.missionProfile.findFirst({
    where: { workspaceId, name },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json({ error: "Já existe um perfil com este nome." }, { status: 409 });
  }

  const isDefault = Boolean(body?.isDefault);

  const created = await db.$transaction(async (tx) => {
    if (isDefault) {
      await tx.missionProfile.updateMany({
        where: { workspaceId },
        data: { isDefault: false },
      });
    }
    return tx.missionProfile.create({
      data: {
        workspaceId,
        name,
        description: body?.description?.trim() || null,
        level: body?.level ?? "STANDARD",
        bandeiradaValue: Math.max(0, Math.min(99_999_00, Number(body?.bandeiradaValue) || 4000)),
        maxValue: Math.max(0, Math.min(99_999_00, Number(body?.maxValue) || 8000)),
        currency: (body?.currency ?? "BRL").slice(0, 8),
        items: (body?.items ?? []) as Prisma.InputJsonValue,
        skipPenalty: body?.skipPenalty ?? true,
        skipRequiresText: body?.skipRequiresText ?? true,
        skipMinChars: Math.max(0, Math.min(5000, Number(body?.skipMinChars) || 10)),
        skipMaxItems: Math.max(0, Math.min(50, Number(body?.skipMaxItems) || 3)),
        skipReasons: Array.isArray(body?.skipReasons)
          ? body!.skipReasons!.map((s) => String(s).slice(0, 200))
          : [],
        agentLimit: Math.max(1, Math.min(10, Number(body?.agentLimit) || 3)),
        followupDelayMs: Math.max(60_000, Math.min(168 * 3_600_000, Number(body?.followupDelayMs) || 7_200_000)),
        deadlineHours: Math.max(1, Math.min(720, Number(body?.deadlineHours) || 48)),
        autoSelectRules: (body?.autoSelectRules ?? {}) as Prisma.InputJsonValue,
        isDefault,
        isActive: true,
      },
    });
  });

  await appendAuditLog({
    workspaceId,
    action: "MISSION_PROFILE_CREATED",
    input: { profileId: created.id, name: created.name },
    output: { ok: true },
  }).catch(() => undefined);

  return NextResponse.json({ profile: created });
}
