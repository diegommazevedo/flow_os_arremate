export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, type Prisma } from "@flow-os/db";
import { decrypt } from "@/lib/encrypt";
import { getSessionContext } from "@/lib/session";
import {
  EVOLUTION_QR_FLOW,
  normalizeEvolutionApiBaseUrl,
  normalizeInstancesPayload,
  parseEvolutionConnectionStateJson,
} from "@/lib/evolution";
import {
  applyConnectAttemptResult,
  breakerUserMessage,
  getEvolutionOperational,
  isBreakerBlocking,
  mergeEvolutionOperationalIntoConfig,
  nextSuggestedActionForClass,
  normalizeOperationalStateClock,
  pickQrForClient,
  unwrapEvolutionBody,
} from "@/lib/evolution-connect-ops";

const PostSchema = z.object({
  integrationId: z.string().min(1),
});

/** Mesmas chaves que seed / chat/new / webhook (apiUrl vs EVOLUTION_API_URL). */
function evolutionConnectionParams(config: Record<string, unknown>): {
  apiUrl: string;
  apiKey: string;
  instance: string;
  connectDigits: string;
} {
  const apiUrl = normalizeEvolutionApiBaseUrl(
    String(
      config["apiUrl"] ??
        config["EVOLUTION_API_URL"] ??
        process.env["EVOLUTION_API_URL"] ??
        "",
    ),
  );
  const keyRaw = config["apiKey"];
  const apiKey =
    typeof keyRaw === "string" && keyRaw.length > 0
      ? (() => {
          try {
            return decrypt(keyRaw);
          } catch {
            return process.env["EVOLUTION_API_KEY"] ?? "";
          }
        })()
      : (process.env["EVOLUTION_API_KEY"] ?? "");
  const instance = String(
    config["instanceName"] ?? config["EVOLUTION_INSTANCE_NAME"] ?? "",
  ).trim();
  const connectDigits = String(
    config["connectNumber"] ??
      config["EVOLUTION_CONNECT_NUMBER"] ??
      process.env["EVOLUTION_CONNECT_NUMBER"] ??
      "",
  ).replace(/\D/g, "");
  return { apiUrl, apiKey, instance, connectDigits };
}

function evolutionJsonResponse(body: Record<string, unknown>, status: number): NextResponse {
  const out = NextResponse.json(body, { status });
  out.headers.set("X-FlowOS-Evolution-QR-Flow", EVOLUTION_QR_FLOW);
  return out;
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

async function evolutionLogoutForPairing(
  apiUrl: string,
  apiKey: string,
  instance: string,
): Promise<void> {
  await fetch(`${apiUrl}/instance/logout/${encodeURIComponent(instance)}`, {
    method:  "DELETE",
    headers: { apikey: apiKey },
    signal:  AbortSignal.timeout(20_000),
  }).catch(() => null);
}

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

  await evolutionLogoutForPairing(apiUrl, apiKey, instance);
  await sleep(2500);

  let lastBody: Record<string, unknown> | null = null;
  for (let i = 0; i < 4; i++) {
    if (i > 0) await sleep(1500);
    const step = await fetchConnectBody(apiUrl, apiKey, instance, connectDigits);
    if (!step.ok) return { failConnect: step.status };
    lastBody = step.data;
    const qrcode = pickQrForClient(step.data);
    if (qrcode) return { qrcode, lastBody: step.data };
  }

  await evolutionLogoutForPairing(apiUrl, apiKey, instance);
  await sleep(2000);

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

async function buildEvolutionConnectFailurePayload(opts: {
  status: number;
  apiUrl: string;
  apiKey: string;
  instance: string;
}): Promise<{ error: string; diagnostic: Record<string, unknown> }> {
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

  return {
    error: `${baseMsg}. ${hint}`,
    diagnostic: {
      host,
      connectPath:            `/instance/connect/${encodeURIComponent(instance)}`,
      fetchInstancesHttp:     fetchInstancesStatus,
      instanceNamesOnServer:  namesListed.slice(0, 30),
      configuredInstance:     instance,
      instanceListedOnServer: instanceListed,
    },
  };
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
      const config = (integration.config ?? {}) as Record<string, unknown>;
      const { apiUrl, apiKey, instance } = evolutionConnectionParams(config);

      let state = "close";
      if (apiUrl && instance) {
        try {
          const res = await fetch(
            `${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`,
            { headers: { apikey: apiKey }, signal: AbortSignal.timeout(4000) },
          );
          if (res.ok) {
            const raw = (await res.json()) as unknown;
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

  const integrationId = parsed.data.integrationId;

  const integration = await db.workspaceIntegration.findFirst({
    where:  { id: integrationId, workspaceId: session.workspaceId, type: "WHATSAPP_EVOLUTION" },
    select: { config: true },
  });
  if (!integration) {
    return NextResponse.json({ error: "Integracao nao encontrada" }, { status: 404 });
  }

  const cfgRecord = { ...(integration.config as Record<string, unknown>) };
  const now         = new Date();
  let op            = normalizeOperationalStateClock(getEvolutionOperational(cfgRecord), now);

  if (isBreakerBlocking(op, now)) {
    return evolutionJsonResponse(
      {
        ok:                   false,
        status:               "degraded",
        sessionState:         op.sessionState ?? "zombie",
        responseClass:        op.lastConnectResponseClass ?? null,
        breakerOpen:          true,
        breakerUntil:         op.zombieUntil ?? null,
        breakerReason:        op.breakerReason ?? null,
        message:              breakerUserMessage(op.breakerReason),
        nextSuggestedAction:
          "Aguarde o fim da janela de bloqueio (alguns minutos) antes de solicitar um novo QR.",
        evolutionQrFlow:      EVOLUTION_QR_FLOW,
        build:                EVOLUTION_QR_FLOW,
      },
      429,
    );
  }

  const persistOp = async (next: typeof op) => {
    const merged = mergeEvolutionOperationalIntoConfig(cfgRecord, next);
    await db.workspaceIntegration.update({
      where: { id: integrationId },
      data:  { config: merged as Prisma.InputJsonValue },
    });
  };

  const { apiUrl, apiKey, instance, connectDigits } = evolutionConnectionParams(cfgRecord);

  if (!apiUrl || !instance) {
    return NextResponse.json({ error: "Instancia nao configurada" }, { status: 400 });
  }

  const usedNumberParam = connectDigits.length >= 10;

  try {
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
      const opNext = applyConnectAttemptResult({
        prev: op,
        now,
        result: { kind: "http_fail", status: 401 },
      });
      await persistOp(opNext);
      const failPayload = await buildEvolutionConnectFailurePayload({
        status: 401,
        apiUrl,
        apiKey,
        instance,
      });
      return evolutionJsonResponse(
        {
          ok:                   false,
          status:               "degraded",
          sessionState:         opNext.sessionState,
          responseClass:        opNext.lastConnectResponseClass,
          responseKeysHint:     null,
          breakerOpen:          opNext.breakerOpen ?? false,
          breakerUntil:         opNext.zombieUntil ?? null,
          breakerReason:        opNext.breakerReason ?? null,
          message:              failPayload.error,
          nextSuggestedAction:  nextSuggestedActionForClass(opNext.lastConnectResponseClass, usedNumberParam),
          diagnostic:           { createRejected: true, ...failPayload.diagnostic },
          error:                failPayload.error,
          evolutionQrFlow:      EVOLUTION_QR_FLOW,
          build:                EVOLUTION_QR_FLOW,
        },
        502,
      );
    }

    const obtained = await obtainQrcodeWithRetries({
      apiUrl,
      apiKey,
      instance,
      connectDigits,
    });

    if ("failConnect" in obtained) {
      const opNext = applyConnectAttemptResult({
        prev: op,
        now,
        result: { kind: "http_fail", status: obtained.failConnect },
      });
      await persistOp(opNext);
      const failPayload = await buildEvolutionConnectFailurePayload({
        status: obtained.failConnect,
        apiUrl,
        apiKey,
        instance,
      });
      return evolutionJsonResponse(
        {
          ok:                   false,
          status:               "degraded",
          sessionState:         opNext.sessionState,
          responseClass:        opNext.lastConnectResponseClass,
          responseKeysHint:     null,
          breakerOpen:          opNext.breakerOpen ?? false,
          breakerUntil:         opNext.zombieUntil ?? null,
          breakerReason:        opNext.breakerReason ?? null,
          message:              failPayload.error,
          nextSuggestedAction:  nextSuggestedActionForClass(opNext.lastConnectResponseClass, usedNumberParam),
          diagnostic:           failPayload.diagnostic,
          error:                failPayload.error,
          evolutionQrFlow:      EVOLUTION_QR_FLOW,
          build:                EVOLUTION_QR_FLOW,
        },
        502,
      );
    }

    if ("empty" in obtained) {
      const opNext = applyConnectAttemptResult({
        prev: op,
        now,
        result: {
          kind: "empty",
          body: obtained.lastBody,
          keys: obtained.topLevelKeys,
        },
      });
      await persistOp(opNext);
      const hint =
        connectDigits.length < 10
          ? " Dica: defina EVOLUTION_CONNECT_NUMBER (DDI+DDD+número, só dígitos) no flowos-web ou connectNumber na integração — algumas builds Evolution só devolvem QR com ?number=."
          : "";
      return evolutionJsonResponse(
        {
          ok:                   false,
          status:               "degraded",
          sessionState:         opNext.sessionState,
          responseClass:        opNext.lastConnectResponseClass,
          responseKeysHint:     obtained.topLevelKeys,
          breakerOpen:          opNext.breakerOpen ?? false,
          breakerUntil:         opNext.zombieUntil ?? null,
          breakerReason:        opNext.breakerReason ?? null,
          message:              `QR Code nao disponivel após várias tentativas.${hint}`,
          nextSuggestedAction:  nextSuggestedActionForClass(opNext.lastConnectResponseClass, usedNumberParam),
          diagnostic: {
            connectRetriesExhausted: true,
            responseKeysHint:        obtained.topLevelKeys,
            usedNumberParam:         usedNumberParam,
          },
          error: `QR Code nao disponivel após várias tentativas.${hint}`,
          evolutionQrFlow: EVOLUTION_QR_FLOW,
          build:           EVOLUTION_QR_FLOW,
        },
        202,
      );
    }

    const opNext = applyConnectAttemptResult({
      prev: op,
      now,
      result: { kind: "qr_success" },
    });
    await persistOp(opNext);

    return evolutionJsonResponse(
      {
        ok:              true,
        status:          "ok",
        sessionState:    "qr_ready",
        responseClass:   "qr_payload",
        breakerOpen:     false,
        qrcode:          obtained.qrcode,
        evolutionQrFlow: EVOLUTION_QR_FLOW,
        build:           EVOLUTION_QR_FLOW,
      },
      200,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Timeout ao conectar na Evolution API" },
      { status: 504 },
    );
  }
}
