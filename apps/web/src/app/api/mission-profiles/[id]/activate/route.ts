/**
 * POST /api/mission-profiles/[id]/activate — define como padrão do workspace.
 * [SEC-03] · [SEC-06]
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const target = await db.missionProfile.findFirst({
    where: { id, workspaceId },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.missionProfile.updateMany({
      where: { workspaceId },
      data: { isDefault: false },
    });
    await tx.missionProfile.update({
      where: { id, workspaceId },
      data: { isDefault: true, isActive: true },
    });
  });

  await appendAuditLog({
    workspaceId,
    action: "MISSION_PROFILE_ACTIVATED_DEFAULT",
    input: { profileId: id },
    output: { name: target.name },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
