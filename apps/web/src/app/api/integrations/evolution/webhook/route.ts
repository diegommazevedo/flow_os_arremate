/**
 * POST /api/integrations/evolution/webhook
 *
 * Configura o webhook de uma instância Evolution API para
 * apontar para /api/webhooks/evolution deste servidor.
 *
 * [SEC-03] workspaceId da sessão
 * [SEC-06] AuditLog na configuração
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { decrypt } from "@/lib/encrypt";
import { normalizeEvolutionApiBaseUrl } from "@/lib/evolution";
import { getSessionContext } from "@/lib/session";

const Body = z.object({
  integrationId: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "integrationId obrigatório" }, { status: 400 });
  }

  const { workspaceId } = session;

  const integration = await db.workspaceIntegration.findFirst({
    where: { id: parsed.data.integrationId, workspaceId, type: "WHATSAPP_EVOLUTION" },
  });
  if (!integration) {
    return NextResponse.json({ error: "Integração não encontrada" }, { status: 404 });
  }

  const config   = (integration.config ?? {}) as Record<string, string>;
  const apiUrl   = normalizeEvolutionApiBaseUrl(
    config["apiUrl"] ?? process.env["EVOLUTION_API_URL"] ?? "http://localhost:8080",
  );
  const apiKey   = config["apiKey"] ? decrypt(config["apiKey"]) : (process.env["EVOLUTION_API_KEY"] ?? "");
  const instance = config["instanceName"] ?? "";

  if (!instance) {
    return NextResponse.json({ error: "instanceName não configurado na integração" }, { status: 400 });
  }

  const appUrl = process.env["NEXT_PUBLIC_URL"] ?? process.env["NEXTAUTH_URL"] ?? "http://localhost:3030";
  const webhookUrl = `${appUrl}/api/webhooks/evolution`;

  try {
    const res = await fetch(`${apiUrl}/webhook/set/${instance}`, {
      method:  "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        url:                webhookUrl,
        webhook_by_events:  false,
        webhook_base64:     false,
        events: [
          "MESSAGES_UPSERT",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
          "MESSAGES_UPDATE",
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Evolution API ${res.status}: ${err.slice(0, 200)}` },
        { status: 502 },
      );
    }

    // Atualizar config com webhookConfigured
    await db.workspaceIntegration.update({
      where: { id: integration.id },
      data: {
        config: { ...config, webhookConfigured: "true", webhookUrl },
      },
    });

    // AuditLog [SEC-06]
    await db.agentAuditLog.create({
      data: {
        workspaceId,
        agentId:    "integrations_ui",
        action:     "evolution_webhook_configured",
        input:      { integrationId: integration.id, instance, webhookUrl },
        output:     { ok: true },
        modelUsed:  "none",
        tokensUsed: 0,
        costUsd:    0,
        durationMs: 0,
        success:    true,
      },
    });

    return NextResponse.json({ ok: true, webhookUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Timeout ao configurar webhook" },
      { status: 504 },
    );
  }
}
