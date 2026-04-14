/**
 * GET /api/field-agents/audit — logs de auditoria FIELD_AGENT_*
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? "50")));

  const where = {
    workspaceId,
    action: action
      ? { equals: action }
      : { startsWith: "FIELD_AGENT_" },
  };

  const [items, total] = await Promise.all([
    db.agentAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        action: true,
        input: true,
        output: true,
        success: true,
        error: true,
        createdAt: true,
      },
    }),
    db.agentAuditLog.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}
