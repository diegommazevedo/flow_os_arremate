export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { sendEmail } from "@flow-os/brain/providers/email-sender";
import { getSessionWorkspaceId } from "@/lib/session";

const ReplySchema = z.object({
  bodyText:  z.string().min(1).max(50000),
  bodyHtml:  z.string().max(200000).optional(),
  cc:        z.array(z.string().email()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // [SEC-03] workspaceId na query
  const original = await db.email.findFirst({
    where: { id, workspaceId },
    include: { account: { select: { id: true } } },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // [SEC-08] Sanitizar texto externo
  const safeBody = defaultSanitizer.clean(parsed.data.bodyText);
  const subject = `Re: ${original.subject}`;

  await sendEmail({
    accountId:   original.account.id,
    workspaceId,
    to:          [original.from],
    cc:          parsed.data.cc,
    subject,
    bodyText:    safeBody,
    bodyHtml:    parsed.data.bodyHtml,
    inReplyTo:   original.messageId,
    dealId:      original.dealId ?? undefined,
  });

  // Marcar original como respondido
  await db.email.update({ where: { id }, data: { respondido: true } });

  return NextResponse.json({ ok: true }, { status: 201 });
}
