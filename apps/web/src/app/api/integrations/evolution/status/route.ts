export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { decrypt } from "@/lib/encrypt";
import { getSessionContext } from "@/lib/session";
import {
  EVOLUTION_QR_FLOW,
  normalizeEvolutionApiBaseUrl,
  normalizeInstancesPayload,
} from "@/lib/evolution";

const PostSchema = z.object({
  integrationId: z.string().min(1),
});

/** Mesmas chaves que seed / chat/new / webhook (apiUrl vs EVOLUTION_API_URL). */
function evolutionConnectionParams(config: Record<string, string>): {
  apiUrl: string;
  apiKey: string;
  instance: string;
} {
  const apiUrl = normalizeEvolutionApiBaseUrl(
    config["apiUrl"] ||
      config["EVOLUTION_API_URL"] ||
      process.env["EVOLUTION_API_URL"] ||
      "",
  );
  const apiKey = config["apiKey"]
    ? (() => {
        try {
          return decrypt(config["apiKey"]);
        } catch {
          return process.env["EVOLUTION_API_KEY"] ?? "";
        }
      })()
    : (process.env["EVOLUTION_API_KEY"] ?? "");
  const instance = (
    config["instanceName"] ??
    config["EVOLUTION_INSTANCE_NAME"] ??
    ""
  ).trim();
  return { apiUrl, apiKey, instance };
}

/** Evolution v2 embute o payload útil em `data` / `response`. */
function unwrapEvolutionBody(parsed: Record<string, unknown>): Record<string, unknown> {
  let out = { ...parsed };
  for (const key of ["data", "response"] as const) {
    const inner = out[key];
    if (inner && typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
      out = { ...out, ...(inner as Record<string, unknown>) };
    }
  }
  return out;
}

/**
 * Documentação Evolution 2.1.1: QR em GET /instance/connect/{instance}
 * (não GET /instance/qrcode/... — essa rota costuma devolver 404 nas builds atuais).
 */
function pickQrForClient(data: Record<string, unknown>): string | null {
  const asString = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  const toDataUri = (raw: string): string => {
    if (raw.startsWith("data:")) return raw;
    const stripped = raw.replace(/^data:image\/\w+;base64,/, "");
    return `data:image/png;base64,${stripped}`;
  };

  const base64 = asString(data["base64"]);
  if (base64) return toDataUri(base64);

  const nested = data["qrcode"];
  if (nested && typeof nested === "object" && nested !== null) {
    const n = nested as Record<string, unknown>;
    const b = asString(n["base64"]) ?? asString(n["code"]);
    if (b) {
      if (b.startsWith("data:") || b.length >= 800) return toDataUri(b);
    }
  }

  const code = asString(data["code"]);
  if (code && (code.startsWith("data:") || code.length >= 800)) return toDataUri(code);

  const pairing = asString(data["pairingCode"]);
  if (pairing) return pairing;

  return null;
}

/** Resposta 502 com diagnóstico: compara connect 404 com fetchInstances no mesmo host/chave. */
async function evolutionConnectFailureResponse(opts: {
  status: number;
  apiUrl: string;
  apiKey: string;
  instance: string;
}): Promise<NextResponse> {
  const { status, apiUrl, apiKey, instance } = opts;

  let host = "";
  try {
    host = new URL(apiUrl).host;
  } catch {
    host = "(api-url-invalida)";
  }

  let namesListed: string[] = [];
  let fetchInstancesStatus: number | null = null;
  try {
    const r = await fetch(`${apiUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(6000),
    });
    fetchInstancesStatus = r.status;
    if (r.ok) {
      const raw = (await r.json()) as unknown;
      namesListed = normalizeInstancesPayload(raw).map((x) => x.instanceName);
    }
  } catch {
    fetchInstancesStatus = null;
  }

  const instanceListed = namesListed.includes(instance);
  const baseMsg = `Evolution API HTTP ${status} em GET /instance/connect/${encodeURIComponent(instance)}`;

  let hint = "";
  if (status === 404) {
    if (fetchInstancesStatus === 401) {
      hint =
        " fetchInstances também rejeitou a chave (401) — alinhe apikey do FlowOS com AUTHENTICATION_API_KEY da Evolution.";
    } else if (namesListed.length === 0 && fetchInstancesStatus === 200) {
      hint =
        " Lista vazia neste host — crie a instância aqui ou confirme que a URL da integração é a mesma do curl.";
    } else if (namesListed.length > 0 && !instanceListed) {
      hint = ` O nome "${instance}" não consta neste servidor. Nomes: ${namesListed.join(", ")}. Ajuste "Nome da instância" na integração.`;
    } else if (instanceListed) {
      hint =
        " Instância listada mas connect=404 — possível bug/proxy da Evolution ou URL base incorreta; confira imagem v2.1.1 e host sem /manager.";
    } else {
      hint = " Confira URL (raiz do API, sem /manager), apikey e nome da instância.";
    }
  }

  const body = {
    error:           `${baseMsg}. ${hint}`,
    evolutionQrFlow: EVOLUTION_QR_FLOW,
    diagnostic: {
      host,
      connectPath:            `/instance/connect/${encodeURIComponent(instance)}`,
      fetchInstancesHttp:     fetchInstancesStatus,
      instanceNamesOnServer:  namesListed.slice(0, 30),
      configuredInstance:     instance,
      instanceListedOnServer: instanceListed,
    },
  };

  const out = NextResponse.json(body, { status: 502 });
  out.headers.set("X-FlowOS-Evolution-QR-Flow", EVOLUTION_QR_FLOW);
  return out;
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
            `${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`,
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
    // OpenAPI v2.1.1: `integration` é obrigatório; 403 = nome já em uso (seguir para connect).
    const createRes = await fetch(`${apiUrl}/instance/create`, {
      method:  "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify({
        instanceName: instance,
        integration: "WHATSAPP-BAILEYS",
        qrcode:       true,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (createRes?.status === 401) {
      return NextResponse.json(
        { error: "Evolution API: apikey inválida ou não autorizada (HTTP 401)" },
        { status: 502 },
      );
    }

    // QR oficial v2.1.1: GET /instance/connect/{instance}
    const res = await fetch(`${apiUrl}/instance/connect/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      signal:  AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return await evolutionConnectFailureResponse({
        status: res.status,
        apiUrl,
        apiKey,
        instance,
      });
    }

    const raw = (await res.json()) as Record<string, unknown>;
    const data = unwrapEvolutionBody(raw);
    const qrcode = pickQrForClient(data);
    if (!qrcode) {
      return NextResponse.json(
        {
          error:            "QR Code nao disponivel — tente em alguns segundos",
          evolutionQrFlow:  EVOLUTION_QR_FLOW,
        },
        { status: 202 },
      );
    }

    const out = NextResponse.json({ qrcode, evolutionQrFlow: EVOLUTION_QR_FLOW });
    out.headers.set("X-FlowOS-Evolution-QR-Flow", EVOLUTION_QR_FLOW);
    return out;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Timeout ao conectar na Evolution API" },
      { status: 504 },
    );
  }
}
