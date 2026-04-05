export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { db }                        from "@flow-os/db";
import { getSessionWorkspaceId }     from "@/lib/session";

const Schema = z.object({
  name:  z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")).transform(v => v || undefined),
  phone: z.string().max(20).optional().or(z.literal("")).transform(v => v || undefined),
  type:  z.enum(["PERSON", "COMPANY"]).default("PERSON"),
});

export async function POST(req: NextRequest) {
  // [SEC-03] workspaceId da sessão — nunca do body
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, phone, type } = parsed.data;

  const contact = await db.contact.create({
    data: { workspaceId, name, email: email ?? null, phone: phone ?? null, type },
    select: { id: true, name: true, email: true, phone: true, type: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, contact }, { status: 201 });
}
