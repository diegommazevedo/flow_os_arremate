export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";

/**
 * Persistência única de WhatsApp (Meta ou Evolution): sem connect/QR/Evolution.
 * Com `integrationId` no body → PUT update; sem → POST create.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const integrationIdRaw = body["integrationId"];
  const integrationId =
    typeof integrationIdRaw === "string" && integrationIdRaw.length > 0 ? integrationIdRaw : undefined;

  const cookie = req.headers.get("cookie") ?? "";
  const origin = req.nextUrl.origin;

  if (integrationId) {
    const { integrationId: _omit, ...patch } = body;
    const r = await fetch(`${origin}/api/integrations/whatsapp/${encodeURIComponent(integrationId)}/update`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body:    JSON.stringify(patch),
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json", "X-FlowOS-Integration-Save": "update" },
    });
  }

  const r = await fetch(`${origin}/api/integrations/whatsapp/create`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", cookie },
    body:    JSON.stringify(body),
  });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json", "X-FlowOS-Integration-Save": "create" },
  });
}
