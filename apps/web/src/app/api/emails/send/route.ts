export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defaultSanitizer } from "@flow-os/core";
import { sendEmail } from "@flow-os/brain/providers/email-sender";
import { getSessionWorkspaceId } from "@/lib/session";

const SendSchema = z.object({
  accountId: z.string().cuid(),
  to:        z.array(z.string().email()).min(1),
  cc:        z.array(z.string().email()).optional(),
  subject:   z.string().min(1).max(998),
  bodyText:  z.string().min(1).max(50000),
  bodyHtml:  z.string().max(200000).optional(),
  dealId:    z.string().cuid().optional(),
});

export async function POST(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // [SEC-08] Sanitizar textos externos
  const safeSubject = defaultSanitizer.clean(parsed.data.subject);
  const safeBody    = defaultSanitizer.clean(parsed.data.bodyText);

  await sendEmail({
    accountId:   parsed.data.accountId,
    workspaceId, // [SEC-03] sempre da sessão
    to:          parsed.data.to,
    cc:          parsed.data.cc,
    subject:     safeSubject,
    bodyText:    safeBody,
    bodyHtml:    parsed.data.bodyHtml,
    dealId:      parsed.data.dealId,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
