/**
 * PATCH /api/contacts/[id]/tags — adiciona ou remove etiqueta.
 * Body: { tagId: string, action: "add" | "remove" }
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId, userId } = session;
  const { id: contactId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { tagId?: string; action?: "add" | "remove" }
    | null;
  const tagId = body?.tagId?.trim();
  const action = body?.action;
  if (!tagId || (action !== "add" && action !== "remove")) {
    return NextResponse.json({ error: "tagId e action inválidos" }, { status: 400 });
  }

  const contact = await db.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  const tag = await db.tag.findFirst({
    where: { id: tagId, workspaceId },
    select: { id: true },
  });
  if (!tag) {
    return NextResponse.json({ error: "Tag não encontrada" }, { status: 404 });
  }

  if (action === "add") {
    await db.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      create: {
        workspaceId,
        contactId,
        tagId,
        addedBy: userId ?? "system",
      },
      update: {},
    });
  } else {
    await db.contactTag.deleteMany({
      where: { workspaceId, contactId, tagId },
    });
  }

  return NextResponse.json({ ok: true });
}
