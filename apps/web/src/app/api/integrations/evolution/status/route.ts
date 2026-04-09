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
  parseEvolutionConnectionStateJson,
} from "@/lib/evolution";

const PostSchema = z.object({
  integrationId: z.string().min(1),
});

/** Mesmas chaves que seed / chat/new / webhook (apiUrl vs EVOLUTION_API_URL). */
function evolutionConnectionParams(config: Record<string, string>): {
  apiUrl: string;
  apiKey: string;
  instance: string;
  /** DDI+DDD+número só dígitos — GET /instance/connect/...?number= (workaround Evolution). */
  connectDigits: string;
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
  const connectDigits = (
    config["connectNumber"] ??
    config["EVOLUTION_CONNECT_NUMBER"] ??
    process.env["EVOLUTION_CONNECT_NUMBER"] ??
    ""
  ).replace(/\D/g, "");
  return { apiUrl, apiKey, instance, connectDigits };
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
 * PNG / data URI — mesmo critério que evolution-qr-live (evita tratar token Baileys curto como imagem).
 */
function asImagePayload(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s.startsWith("data:image")) return s;
  if (s.length >= 800) return s;
  return undefined;
}

function toDataUri(raw: string): string {
  if (raw.startsWith("data:")) return raw;
  const stripped = raw.replace(/^data:image\/\w+;base64,/, "");
  return `data:image/png;base64,${stripped}`;
}

/**
 * Documentação Evolution 2.1.1: QR em GET /instance/connect/{instance}.
 * Varre objeto plano + `instance` aninhado (como scripts locais).
 */
function pickQrForClient(data: Record<string, unknown>): string | null {
  const asString = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  const fromFlat = (obj: Record<string, unknown>): string | null => {
    const base64 = asString(obj["base64"]);
    if (base64) return toDataUri(base64);

    const nested = obj["qrcode"];
    if (nested && typeof nested === "object" && nested !== null) {
      const n = nested as Record<string, unknown>;
      const img =
        asImagePayload(asString(n["base64"])) ??
        asImagePayload(asString(n["qrcode"])) ??
        asImagePayload(asString(n["code"]));
      if (img) return img.startsWith("data:") ? img : toDataUri(img);
      const nb = asString(n["base64"]);
      if (nb) return toDataUri(nb);
      const pairN = asString(n["pairingCode"]);
      if (pairN) return pairN;
    }

    const imgTop =
      asImagePayload(asString(obj["qrcode"])) ??
      asImagePayload(asString(obj["code"]));
    if (imgTop) return imgTop.startsWith("data:") ? imgTop : toDataUri(imgTop);

    const code = asString(obj["code"]);
    if (code?.startsWith("2@")) return code;
    if (code && /^[A-Z0-9]{6,16}$/i.test(code)) return code;

    const pairing = asString(obj["pairingCode"]);
    if (pairing) return pairing;

    return null;
  };

  const walk = (obj: Record<string, unknown>): string | null => {
    const got = fromFlat(obj);
    if (got) return got;
    const inst = obj["instance"];
    if (inst && typeof inst === "object" && inst !== null) {
      return walk(inst as Record<string, unknown>);
    }
    return null;
  };

  return walk(data);
}

function buildConnectUrl(apiUrl: string, instance: string, connectDigits: string): string {
  const path = `${apiUrl}/instance/connect/${encodeURIComponent(instance)}`;
  if (connectDigits.length >= 10) return `${path}?number=${encodeURIComponent(connectDigits)}`;
  return path;
}

async function fetchConnectBody(
  apiUrl: string,
  apiKey: string,
  instance: string,
  connectDigits: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number }> {
  const res = await fetch(buildConnectUrl(apiUrl, instance, connectDigits), {
    headers: { apikey: apiKey },
    signal:  AbortSignal.timeout(12_000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const raw = (await res.json()) as Record<string, unknown>;
  return { ok: true, data: unwrapEvolutionBody(raw) };
}

/** Rajadas + restart: Evolution muitas vezes devolve 200 com corpo vazio até estabilizar (v2.1.1). */
async function obtainQrcodeWithRetries(opts: {
  apiUrl: string;
  apiKey: string;
  instance: string;
  connectDigits: string;
}): Promise<
  | { qrcode: string; lastBody: Record<string, unknown> }
  | { failConnect: number }
  | { empty: true; lastBody: Record<string, unknown> | null; topLevelKeys: string[] }
> {
  const { apiUrl, apiKey, instance, connectDigits } = opts;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let lastBody: Record<string, unknown> | null = null;
  for (let i = 0; i < 4; i++) {
    if (i > 0) await sleep(1500);
    const step = await fetchConnectBody(apiUrl, apiKey, instance, connectDigits);
    if (!step.ok) return { failConnect: step.status };
    lastBody = step.data;
    const qrcode = pickQrForClient(step.data);
    if (qrcode) return { qrcode, lastBody: step.data };
  }

  await fetch(`${apiUrl}/instance/restart/${encodeURIComponent(instance)}`, {
    method:  "POST",
    headers: { apikey: apiKey },
    signal:  AbortSignal.timeout(20_000),
  }).catch(() => null);

  await sleep(3500);

  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(1500);
    const step = await fetchConnectBody(apiUrl, apiKey, instance, connectDigits);
    if (!step.ok) return { failConnect: step.status };
    lastBody = step.data;
    const qrcode = pickQrForClient(step.data);
    if (qrcode) return { qrcode, lastBody: step.data };
  }

  const keys = lastBody ? Object.keys(lastBody).slice(0, 24) : [];
  return { empty: true, lastBody, topLevelKeys: keys };
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
            const raw = await res.json() as unknown;
            const st = parseEvolutionConnectionStateJson(raw);
            state = st.length > 0 ? st : "close";
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
  const { apiUrl, apiKey, instance, connectDigits } = evolutionConnectionParams(config);

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

    const obtained = await obtainQrcodeWithRetries({
      apiUrl,
      apiKey,
      instance,
      connectDigits,
    });

    if ("failConnect" in obtained) {
      return await evolutionConnectFailureResponse({
        status: obtained.failConnect,
        apiUrl,
        apiKey,
        instance,
      });
    }

    if ("empty" in obtained) {
      const hint =
        connectDigits.length < 10
          ? " Dica: defina EVOLUTION_CONNECT_NUMBER (DDI+DDD+número, só dígitos) no flowos-web ou connectNumber na integração — algumas builds Evolution só devolvem QR com ?number=."
          : "";
      return NextResponse.json(
        {
          error:            `QR Code nao disponivel após várias tentativas.${hint}`,
          evolutionQrFlow:  EVOLUTION_QR_FLOW,
          diagnostic: {
            connectRetriesExhausted: true,
            responseKeysHint:        obtained.topLevelKeys,
            usedNumberParam:         connectDigits.length >= 10,
          },
        },
        { status: 202 },
      );
    }

    const out = NextResponse.json({
      qrcode:          obtained.qrcode,
      evolutionQrFlow: EVOLUTION_QR_FLOW,
    });
    out.headers.set("X-FlowOS-Evolution-QR-Flow", EVOLUTION_QR_FLOW);
    return out;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Timeout ao conectar na Evolution API" },
      { status: 504 },
    );
  }
}
