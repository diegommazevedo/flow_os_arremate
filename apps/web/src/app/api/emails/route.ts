export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const page   = Math.max(1, parseInt(params.get("page") ?? "1"));
  const limit  = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "50")));
  const lido   = params.get("lido");
  const dealId = params.get("dealId");
  const eisenhower = params.get("eisenhower");

  const [emails, total] = await Promise.all([
    db.email.findMany({
      where: {
        workspaceId, // [SEC-03]
        ...(lido !== null ? { lido: lido === "true" } : {}),
        ...(dealId ? { dealId } : {}),
        ...(eisenhower ? { eisenhower } : {}),
      },
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        from: true,
        fromName: true,
        subject: true,
        eisenhower: true,
        lido: true,
        importante: true,
        enviado: true,
        receivedAt: true,
        dealId: true,
        contactId: true,
      },
    }),
    db.email.count({ where: { workspaceId, ...(lido !== null ? { lido: lido === "true" } : {}) } }),
  ]);

  return NextResponse.json({ emails, total, page, limit });
}
