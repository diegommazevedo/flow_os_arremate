export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, type Prisma } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contact = await db.contact.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });
  if (!contact) return NextResponse.json({ error: "Contato nao encontrado" }, { status: 404 });

  return NextResponse.json({ contact });
}

const PatchSchema = z.object({
  name:  z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  meta:  z.record(z.unknown()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contact = await db.contact.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, meta: true },
  });
  if (!contact) return NextResponse.json({ error: "Contato nao encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name  !== undefined) updateData["name"]  = defaultSanitizer.clean(parsed.data.name ?? "");
  if (parsed.data.email !== undefined) updateData["email"] = parsed.data.email ?? null;
  if (parsed.data.phone !== undefined) updateData["phone"] = parsed.data.phone ?? null;
  if (parsed.data.meta  !== undefined) {
    const prevMeta = (contact.meta ?? {}) as Prisma.JsonObject;
    const newMeta  = parsed.data.meta as Prisma.JsonObject;
    updateData["meta"] = { ...prevMeta, ...newMeta } as Prisma.InputJsonObject;
  }

  const updated = await db.contact.update({
    where: { id: contact.id },
    data:  updateData,
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action: "contact.update",
    input:  { contactId: id, fields: Object.keys(updateData) },
    output: { contactId: updated.id },
  });

  return NextResponse.json({ ok: true, contact: updated });
}
