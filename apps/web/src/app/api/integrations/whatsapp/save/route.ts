export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";

/**
 * Persistência única de WhatsApp (Meta ou Evolution): sem connect/QR/Evolution.
 * Com `integrationId` no body → PUT update; sem → POST create.
 */
async function forwardJson(
  url: string,
  init: RequestInit,
  tag: "update" | "create",
): Promise<NextResponse> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch (err) {
    console.error("[save-integration] fetch", tag, err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Falha de rede ao contactar a API interna de integrações",
      },
      { status: 502 },
    );
  }

  const text = await r.text();
  const trimmed = text.trim();

  if (!trimmed) {
    console.error("[save-integration] resposta vazia", tag, "status", r.status);
    return NextResponse.json(
      {
        error:
          r.status >= 400
            ? `Erro ao guardar integração (HTTP ${r.status}, corpo vazio)`
            : "Resposta vazia do servidor interno",
      },
      { status: r.status >= 400 ? r.status : 500 },
    );
  }

  try {
    const data = JSON.parse(trimmed) as unknown;
    return NextResponse.json(data, {
      status: r.status,
      headers: { "X-FlowOS-Integration-Save": tag },
    });
  } catch {
    console.error("[save-integration] resposta não-JSON", tag, trimmed.slice(0, 300));
    return NextResponse.json(
      {
        error: "Resposta inválida do servidor interno (não é JSON)",
        status: r.status,
      },
      { status: r.status >= 400 ? r.status : 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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
      return forwardJson(
        `${origin}/api/integrations/whatsapp/${encodeURIComponent(integrationId)}/update`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify(patch),
        },
        "update",
      );
    }

    return forwardJson(
      `${origin}/api/integrations/whatsapp/create`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      },
      "create",
    );
  } catch (err) {
    console.error("[save-integration]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
