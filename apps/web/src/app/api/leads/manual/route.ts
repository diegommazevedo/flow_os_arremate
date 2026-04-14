/**
 * POST /api/leads/manual — cria contato + deal mínimo.
 * [SEC-03] [SEC-08] [SEC-06] LEAD_IMPORTED (reutiliza ação de auditoria de lead)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { ensureOpenDealForContact } from "@/lib/lead-deal";

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    phone?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
  } | null;

  const name = defaultSanitizer.clean(body?.name ?? "").slice(0, 200);
  const digits = (body?.phone ?? "").replace(/\D/g, "");
  if (!name || digits.length < 10) {
    return NextResponse.json({ error: "nome e telefone obrigatórios" }, { status: 400 });
  }

  const existing = await db.contact.findFirst({
    where: { workspaceId, phone: digits },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Telefone já cadastrado", contactId: existing.id }, { status: 409 });
  }

  const c = await db.contact.create({
    data: {
      workspaceId,
      name,
      phone: digits,
      leadLifecycle: "PROSPECT",
    },
    select: { id: true },
  });

  const meta: Record<string, unknown> = {};
  if (body?.endereco) meta["imovelEndereco"] = defaultSanitizer.clean(body.endereco).slice(0, 500);
  if (body?.cidade) meta["imovelCidade"] = defaultSanitizer.clean(body.cidade).slice(0, 120);
  if (body?.uf?.trim()) {
    const u = body.uf.trim().toUpperCase().slice(0, 2);
    if (u.length === 2) meta["imovelUF"] = u;
  }

  const dealId = await ensureOpenDealForContact(workspaceId, c.id, meta, `Lead — ${name}`);

  await appendAuditLog({
    workspaceId,
    action: "LEAD_MANUAL_CREATED",
    input: { contactId: c.id },
    output: { dealId },
  }).catch(() => undefined);

  return NextResponse.json({ contactId: c.id, dealId });
}
