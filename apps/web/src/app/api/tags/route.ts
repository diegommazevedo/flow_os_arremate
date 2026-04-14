/**
 * GET/POST /api/tags — etiquetas do workspace.
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tags = await db.tag.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { name?: string; color?: string } | null;
  const name = defaultSanitizer.clean(body?.name ?? "").slice(0, 64);
  const color = defaultSanitizer.clean(body?.color ?? "#888888").slice(0, 16);
  if (!name) {
    return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
  }
  try {
    const tag = await db.tag.create({
      data: { workspaceId, name, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#888888" },
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json(tag);
  } catch {
    const existing = await db.tag.findFirst({
      where: { workspaceId, name },
      select: { id: true, name: true, color: true },
    });
    if (existing) return NextResponse.json(existing);
    return NextResponse.json({ error: "Falha ao criar tag" }, { status: 500 });
  }
}
