export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";

const Schema = z.object({
  name: z.string().min(1).max(120),
  field: z.string().min(1).max(200),
  operator: z.enum(["eq", "ne", "contains", "empty", "not_empty"]),
  value: z.string().max(200).optional().nullable(),
});

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const filters = await db.savedFilter.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ filters });
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const safeName = defaultSanitizer.clean(parsed.data.name);
  const safeField = defaultSanitizer.clean(parsed.data.field);
  const safeValue = parsed.data.value ? defaultSanitizer.clean(parsed.data.value) : null;

  const filter = await db.savedFilter.create({
    data: {
      workspaceId: session.workspaceId,
      name: safeName,
      field: safeField,
      operator: parsed.data.operator,
      value: safeValue,
      createdBy: session.userId ?? "dev",
    },
  });

  return NextResponse.json({ ok: true, filter }, { status: 201 });
}
