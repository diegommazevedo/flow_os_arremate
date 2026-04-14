/**
 * POST /api/deals/[id]/edital/hunt — acionar RPA caçador de editais manualmente
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: dealId } = await params;

  const deal = await db.deal.findFirst({
    where: { id: dealId, workspaceId },
    select: { id: true },
  });
  if (!deal) return NextResponse.json({ error: "Deal não encontrado" }, { status: 404 });

  // Enfileirar hunt
  try {
    const { enqueueEditalHunt } = await import("@flow-os/brain/workers/edital-hunter");
    const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    await enqueueEditalHunt({ dealId, workspaceId }, { url: redisUrl });
  } catch (err) {
    console.warn("[edital/hunt] Falha ao enfileirar:", err);
    return NextResponse.json({ error: "Redis indisponível" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: "Buscando edital automaticamente..." });
}
