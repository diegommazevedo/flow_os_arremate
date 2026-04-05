export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";

const Schema = z.object({
  content: z.string().min(1).max(4000),
});

async function resolveAuditAgentId(workspaceId: string): Promise<string | null> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return agent?.id ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const notes = await db.dealNote.findMany({
    where: { dealId: id, workspaceId: session.workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const safeContent = defaultSanitizer.clean(parsed.data.content);

  const deal = await db.deal.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal não encontrado" }, { status: 404 });
  }

  const note = await db.dealNote.create({
    data: {
      workspaceId: session.workspaceId,
      dealId: deal.id,
      authorId: session.userId ?? "dev",
      authorName: session.userId ?? "Ambiente local",
      content: safeContent,
    },
  });

  const auditAgentId = await resolveAuditAgentId(session.workspaceId);
  if (auditAgentId) {
    await db.agentAuditLog.create({
      data: {
        workspaceId: session.workspaceId,
        agentId: auditAgentId,
        action: "deal.note.create",
        input: { dealId: deal.id, content: safeContent },
        output: { noteId: note.id, dealId: deal.id },
        modelUsed: "none",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
        success: true,
      },
    });
  }

  return NextResponse.json({ ok: true, note }, { status: 201 });
}
