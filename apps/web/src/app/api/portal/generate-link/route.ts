/**
 * POST /api/portal/generate-link
 *
 * Gera um magic link JWT para o portal do cliente (ExternalActor).
 * Uso interno — requer sessão Supabase do membro da equipe.
 *
 * Body: { dealId: string, workspaceId?: string }
 * Response: { url: string, expiresAt: string }
 *
 * Invariantes:
 *   [SEC-03] Autenticação obrigatória (sessão Supabase)
 *   [MULTI-TENANT] Deal validado contra workspaceId do membro autenticado
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies }                   from "next/headers";
import { createServerClient }        from "@supabase/ssr";
import { db }                        from "@flow-os/db";
import { signPortalToken }           from "@/lib/portal-auth";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthenticatedMember() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]      ?? "",
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const member = await db.member.findFirst({
    where:  { userId: user.id },
    select: { workspaceId: true, id: true },
  });

  return member ?? null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // [SEC-03] Autenticação obrigatória
  const member = await getAuthenticatedMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dealId?: string; workspaceId?: string };
  try {
    body = await request.json() as { dealId?: string; workspaceId?: string };
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { dealId } = body;
  if (!dealId || typeof dealId !== "string") {
    return NextResponse.json({ error: "dealId obrigatório" }, { status: 400 });
  }

  // [MULTI-TENANT] Buscar deal garantindo que pertence ao workspace do membro
  const deal = await db.deal.findFirst({
    where: {
      id:          dealId,
      workspaceId: member.workspaceId,
    },
    include: {
      contact: {
        select: { id: true, name: true },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal não encontrado" }, { status: 404 });
  }

  if (!deal.contact) {
    return NextResponse.json(
      { error: "Deal não tem contato vinculado — vincule um ExternalActor antes de gerar o link" },
      { status: 422 },
    );
  }

  // Gerar magic link JWT (TTL 24h, definido em portal-auth.ts)
  const token = await signPortalToken({
    dealId,
    actorId:   deal.contact.id,
    actorName: deal.contact.name ?? "Cliente",
  });

  const baseUrl  = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3030";
  const url      = `${baseUrl}/portal/link/${token}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Registrar no AuditLog (append-only [SEC-06])
  await db.agentAuditLog.create({
    data: {
      workspaceId: member.workspaceId,
      agentId:     member.id,
      action:      "portal_link_generated",
      input:       { dealId, actorId: deal.contact.id },
      output:      { expiresAt },
      modelUsed:   "none",
      tokensUsed:  0,
      costUsd:     0,
      durationMs:  0,
      success:     true,
    },
  });

  return NextResponse.json({ url, expiresAt });
}
