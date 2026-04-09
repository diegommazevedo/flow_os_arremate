export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { decrypt } from "@/lib/encrypt";
import {
  isEvolutionSessionOpenState,
  normalizeEvolutionApiBaseUrl,
  parseEvolutionConnectionStateJson,
} from "@/lib/evolution";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const integration = await db.workspaceIntegration.findFirst({
    where:  { id, workspaceId: session.workspaceId },
    select: { id: true, type: true, config: true },
  });
  if (!integration) return NextResponse.json({ error: "Integracao nao encontrada" }, { status: 404 });

  const config = (integration.config ?? {}) as Record<string, string>;

  try {
    if (integration.type === "WHATSAPP_META") {
      const token = decrypt(config["accessToken"] ?? "");
      const phoneId = decrypt(config["phoneNumberId"] ?? "");
      if (!token || !phoneId) {
        return NextResponse.json({ ok: false, error: "Credenciais incompletas" });
      }
      // Teste: GET no endpoint de número do Meta
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${phoneId}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) {
        const d = await res.json() as { error?: { message?: string } };
        return NextResponse.json({ ok: false, error: d.error?.message ?? `HTTP ${res.status}` });
      }
      const data = await res.json() as { display_phone_number?: string };
      return NextResponse.json({ ok: true, phone: data.display_phone_number });

    } else if (integration.type === "WHATSAPP_EVOLUTION") {
      const apiUrl  = normalizeEvolutionApiBaseUrl(config["apiUrl"] ?? "");
      const apiKey  = decrypt(config["apiKey"] ?? "");
      const instance = (config["instanceName"] ?? "").trim();
      const res = await fetch(
        `${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`,
        { headers: { apikey: apiKey }, signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `HTTP ${res.status}` });
      }
      const raw = await res.json() as unknown;
      const state = parseEvolutionConnectionStateJson(raw) || "unknown";
      return NextResponse.json({ ok: isEvolutionSessionOpenState(state), state });
    }

    return NextResponse.json({ ok: false, error: "Tipo nao suportado" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Timeout" });
  }
}
