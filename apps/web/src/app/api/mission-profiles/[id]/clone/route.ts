/**
 * POST /api/mission-profiles/[id]/clone — duplica perfil com novo nome.
 * [SEC-03] · [SEC-06]
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const src = await db.missionProfile.findFirst({
    where: { id, workspaceId },
  });
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name ?? `${src.name} (cópia)`).trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "name obrigatório" }, { status: 400 });

  const dup = await db.missionProfile.findFirst({
    where: { workspaceId, name },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ error: "Nome já em uso." }, { status: 409 });

  const copy = await db.missionProfile.create({
    data: {
      workspaceId,
      name,
      description: src.description,
      level: src.level,
      bandeiradaValue: src.bandeiradaValue,
      maxValue: src.maxValue,
      currency: src.currency,
      items: src.items as Prisma.InputJsonValue,
      skipPenalty: src.skipPenalty,
      skipRequiresText: src.skipRequiresText,
      skipMinChars: src.skipMinChars,
      skipMaxItems: src.skipMaxItems,
      skipReasons: [...src.skipReasons],
      agentLimit: src.agentLimit,
      followupDelayMs: src.followupDelayMs,
      deadlineHours: src.deadlineHours,
      autoSelectRules: src.autoSelectRules as Prisma.InputJsonValue,
      isDefault: false,
      isActive: true,
    },
  });

  await appendAuditLog({
    workspaceId,
    action: "MISSION_PROFILE_CLONED",
    input: { fromId: id, toId: copy.id, name },
    output: { ok: true },
  }).catch(() => undefined);

  return NextResponse.json({ profile: copy });
}
