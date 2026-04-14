/**
 * POST /api/leads/tags/bulk — aplica etiqueta a vários contatos.
 * Body: { contactIds: string[], tagName: string }
 * [SEC-03] workspaceId · [SEC-08] tagName sanitizado
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId, userId } = session;

  const body = (await req.json().catch(() => null)) as
    | { contactIds?: string[]; tagName?: string }
    | null;
  const contactIds = [...new Set(body?.contactIds ?? [])].filter(Boolean);
  const tagName = defaultSanitizer.clean(body?.tagName ?? "").slice(0, 64);
  if (contactIds.length === 0 || !tagName) {
    return NextResponse.json({ error: "contactIds e tagName obrigatórios" }, { status: 400 });
  }

  const tag = await db.tag.upsert({
    where: { workspaceId_name: { workspaceId, name: tagName } },
    create: { workspaceId, name: tagName, color: "#8b5cf6" },
    update: {},
    select: { id: true },
  });

  let applied = 0;
  for (const contactId of contactIds) {
    const c = await db.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!c) continue;
    await db.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      create: {
        workspaceId,
        contactId,
        tagId: tag.id,
        addedBy: userId ?? "system",
      },
      update: {},
    });
    applied++;
  }

  return NextResponse.json({ applied });
}
