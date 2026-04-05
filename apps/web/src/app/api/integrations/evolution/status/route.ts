export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { decrypt } from "@/lib/encrypt";
import { getSessionContext } from "@/lib/session";

const PostSchema = z.object({
  integrationId: z.string().min(1),
});

/** Mesmas chaves que seed / chat/new / webhook (apiUrl vs EVOLUTION_API_URL). */
function evolutionConnectionParams(config: Record<string, string>): {
  apiUrl: string;
  apiKey: string;
  instance: string;
} {
  const apiUrl = (
    config["apiUrl"] ||
    config["EVOLUTION_API_URL"] ||
    process.env["EVOLUTION_API_URL"] ||
    ""
  ).replace(/\/$/, "");
  const apiKey = config["apiKey"]
    ? (() => {
        try {
          return decrypt(config["apiKey"]);
        } catch {
          return process.env["EVOLUTION_API_KEY"] ?? "";
        }
      })()
    : (process.env["EVOLUTION_API_KEY"] ?? "");
  const instance = config["instanceName"] ?? config["EVOLUTION_INSTANCE_NAME"] ?? "";
  return { apiUrl, apiKey, instance };
}

// ── GET — lista status de todas as contas Evolution do workspace ───────────────

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integrations = await db.workspaceIntegration.findMany({
    where:   { workspaceId: session.workspaceId, type: "WHATSAPP_EVOLUTION" },
    select:  { id: true, name: true, config: true },
    orderBy: { createdAt: "asc" },
  });

  const items = await Promise.all(
    integrations.map(async (integration) => {
      const config = (integration.config ?? {}) as Record<string, string>;
      const { apiUrl, apiKey, instance } = evolutionConnectionParams(config);

      let state = "close";
      if (apiUrl && instance) {
        try {
          const res = await fetch(
            `${apiUrl}/instance/connectionState/${instance}`,
            { headers: { apikey: apiKey }, signal: AbortSignal.timeout(4000) },
          );
          if (res.ok) {
            const data = await res.json() as { instance?: { state?: string } };
            state = data.instance?.state ?? "close";
          }
        } catch {
          state = "error";
        }
      }

      return { id: integration.id, name: integration.name, instanceName: instance, status: state };
    }),
  );

  return NextResponse.json({ integrations: items });
}

// ── POST — gera QR Code de uma integração Evolution específica ────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const integration = await db.workspaceIntegration.findFirst({
    where:  { id: parsed.data.integrationId, workspaceId: session.workspaceId, type: "WHATSAPP_EVOLUTION" },
    select: { config: true },
  });
  if (!integration) {
    return NextResponse.json({ error: "Integracao nao encontrada" }, { status: 404 });
  }

  const config = (integration.config ?? {}) as Record<string, string>;
  const { apiUrl, apiKey, instance } = evolutionConnectionParams(config);

  if (!apiUrl || !instance) {
    return NextResponse.json({ error: "Instancia nao configurada" }, { status: 400 });
  }

  try {
    // Criar instância se não existir
    await fetch(`${apiUrl}/instance/create`, {
      method:  "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify({ instanceName: instance }),
      signal:  AbortSignal.timeout(5000),
    }).catch(() => null);

    // Obter QR Code
    const res = await fetch(
      `${apiUrl}/instance/qrcode/${instance}?image=true`,
      { headers: { apikey: apiKey }, signal: AbortSignal.timeout(8000) },
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Evolution API retornou HTTP ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as {
      qrcode?: { code?: string; base64?: string };
      code?: string;
      base64?: string;
    };

    // Evolution pode retornar o QR em diferentes formatos
    const qrcode = data.qrcode?.code ?? data.qrcode?.base64 ?? data.code ?? data.base64 ?? null;
    if (!qrcode) {
      return NextResponse.json({ error: "QR Code nao disponivel — tente em alguns segundos" }, { status: 202 });
    }

    return NextResponse.json({ qrcode });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Timeout ao conectar na Evolution API" },
      { status: 504 },
    );
  }
}
