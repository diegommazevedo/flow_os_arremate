/**
 * Página local para QR WhatsApp (Evolution) com refresh automático.
 * O browser chama só este host; a chave vai só no servidor (proxy) — evita CORS e key em HTML.
 *
 * Pré-requisito: apps/web/.env.local com EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME
 *
 * Opcional (workaround Evolution v2.2.x QR vazio): EVOLUTION_CONNECT_NUMBER=5511987654321
 * (DDI + DDD + número, só dígitos) → GET /instance/connect/...?number=...
 *
 * Uso: pnpm evolution:qr-live
 *
 * Porta: EVOLUTION_QR_LIVE_PORT no .env.local (default 48763). Se estiver ocupada,
 * o script tenta 48764…48772 e por fim porta efémera (0) escolhida pelo SO.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { normalizeInstancesPayload } from "@flow-os/brain/evolution/instance-state";

const HOST = "127.0.0.1";

/** Preenchido no callback de listen — mostrado no HTML para bater com a barra de endereço. */
let liveListenPort = 0;

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvLocal();
function env(name: string, fallback = ""): string {
  return process.env[name] ?? fileEnv[name] ?? fallback;
}

function preferredPort(): number {
  const raw = env("EVOLUTION_QR_LIVE_PORT", "48763");
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : 48763;
}

const API_URL = env("EVOLUTION_API_URL", "http://localhost:8080").replace(/\/$/, "");
const API_KEY = env("EVOLUTION_API_KEY");
const INSTANCE = env("EVOLUTION_INSTANCE_NAME", "arrematador_01");

function buildConnectUrl(): string {
  const path = `${API_URL}/instance/connect/${encodeURIComponent(INSTANCE)}`;
  const digits = env("EVOLUTION_CONNECT_NUMBER", "").replace(/\D/g, "");
  if (digits.length >= 10) return `${path}?number=${encodeURIComponent(digits)}`;
  return path;
}

/** Algumas builds embrulham o body em `data` / `response`. */
function normalizeEvolutionJson(parsed: Record<string, unknown>): Record<string, unknown> {
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
 * Em Evolution v2 o campo `code` do OpenAPI é token de pareamento — não é PNG.
 * Só tratamos como imagem: `base64`, `data:image...`, ou string longa tipo base64.
 */
function asImagePayload(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s.startsWith("data:image")) return s;
  if (s.length >= 800) return s;
  return undefined;
}

/** Evolution devolve PNG em `base64` (extensões) ou estruturas aninhadas. */
function pickQrBase64(obj: Record<string, unknown> | null): string | undefined {
  if (!obj) return undefined;
  const asString = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const direct =
    asString(obj["base64"]) ??
    asImagePayload(asString(obj["qrcode"])) ??
    asImagePayload(asString(obj["code"]));
  if (direct) return direct;
  const nested = obj["qrcode"];
  if (nested && typeof nested === "object" && nested !== null) {
    const n = nested as Record<string, unknown>;
    const inner =
      asString(n["base64"]) ??
      asImagePayload(asString(n["code"])) ??
      asImagePayload(asString(n["qrcode"]));
    if (inner) return inner;
  }
  const inst = obj["instance"];
  if (inst && typeof inst === "object" && inst !== null) {
    return pickQrBase64(inst as Record<string, unknown>);
  }
  return undefined;
}

function extractState(parsed: Record<string, unknown>): string | undefined {
  const inst = parsed["instance"];
  if (inst && typeof inst === "object" && inst !== null) {
    const s = (inst as { state?: string }).state;
    if (typeof s === "string") return s;
  }
  if (typeof parsed["state"] === "string") return parsed["state"];
  return undefined;
}

function extractCount(parsed: Record<string, unknown>): number | undefined {
  if (typeof parsed["count"] === "number") return parsed["count"];
  const q = parsed["qrcode"];
  if (q && typeof q === "object" && q !== null) {
    const c = (q as { count?: unknown }).count;
    if (typeof c === "number") return c;
  }
  return undefined;
}

function extractPairingCode(parsed: Record<string, unknown>): unknown {
  const top = parsed["pairingCode"];
  if (top != null && String(top).trim() !== "") return String(top).trim();
  const q = parsed["qrcode"];
  if (q && typeof q === "object" && q !== null) {
    const p = (q as { pairingCode?: unknown }).pairingCode;
    if (p != null && String(p).trim() !== "") return String(p).trim();
  }
  /** OpenAPI: `code` é token Baileys; só reutilizamos se parecer código curto de pareamento (não `2@...`). */
  const c = parsed["code"];
  if (typeof c === "string") {
    const t = c.trim();
    if (t.length >= 6 && t.length <= 16 && /^[A-Z0-9]+$/i.test(t)) return t;
  }
  return undefined;
}

/** Mesma lógica que get-evolution-qr.ts: instância em close / count 0 muitas vezes precisa de restart para gerar QR. */
let lastRestartMs = 0;
const RESTART_COOLDOWN_MS = 90_000;

/** Um único restart em voo — evita tempestade quando vários `fetch` do browser chegam ao mesmo tempo. */
let restartPromise: Promise<void> | null = null;

async function evolutionRestartInstance(): Promise<void> {
  await fetch(`${API_URL}/instance/restart/${encodeURIComponent(INSTANCE)}`, {
    method: "POST",
    headers: { apikey: API_KEY },
    signal: AbortSignal.timeout(60_000),
  });
}

async function fetchConnectOnce(): Promise<{
  parsed: Record<string, unknown> | null;
  status: number;
  text: string;
}> {
  const url = buildConnectUrl();
  const res = await fetch(url, {
    headers: { apikey: API_KEY },
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = normalizeEvolutionJson(JSON.parse(text) as Record<string, unknown>);
  } catch {
    parsed = null;
  }
  return { parsed, status: res.status, text };
}

function hasConnectDisplayContent(parsed: Record<string, unknown> | null): boolean {
  if (!parsed) return false;
  return !!(pickQrBase64(parsed) || extractPairingCode(parsed));
}

/** Com ?number= a Evolution v2.2.x muitas vezes só preenche QR/pairing após várias chamadas (issue #1220). */
const CONNECT_BURST_ATTEMPTS = 5;
const CONNECT_BURST_GAP_MS = 2000;

async function fetchConnectBurst(): Promise<{
  parsed: Record<string, unknown> | null;
  status: number;
  text: string;
  burstAttempts: number;
}> {
  let last = await fetchConnectOnce();
  let burstAttempts = 1;
  for (let i = 1; i < CONNECT_BURST_ATTEMPTS; i++) {
    if (last.status < 200 || last.status >= 300 || !last.parsed) break;
    if (hasConnectDisplayContent(last.parsed)) break;
    console.log(
      `  [evolution-qr-live] connect sem QR/código — tentativa ${i + 1}/${CONNECT_BURST_ATTEMPTS} após ${CONNECT_BURST_GAP_MS}ms…`,
    );
    await new Promise((r) => setTimeout(r, CONNECT_BURST_GAP_MS));
    last = await fetchConnectOnce();
    burstAttempts = i + 1;
  }
  return { ...last, burstAttempts };
}

/** Estado real costuma estar aqui; o body de `connect` no OpenAPI v2 nem sempre traz `instance`. */
async function fetchConnectionStateLabel(): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${API_URL}/instance/connectionState/${encodeURIComponent(INSTANCE)}`,
      {
        headers: { apikey: API_KEY },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return undefined;
    const j = (await res.json()) as Record<string, unknown>;
    const inst = j["instance"];
    if (inst && typeof inst === "object" && inst !== null) {
      const raw = inst as Record<string, unknown>;
      const st = raw["state"] ?? raw["connectionStatus"] ?? raw["status"];
      if (typeof st === "string") return st;
    }
    if (typeof j["state"] === "string") return j["state"];
    return undefined;
  } catch {
    return undefined;
  }
}

/** Como a Evolution lista a instância (útil quando /connect só devolve `{ count }`). */
async function fetchInstanceSnapshot(): Promise<{
  instanceName: string;
  state: string;
} | null> {
  try {
    const res = await fetch(`${API_URL}/instance/fetchInstances`, {
      headers: { apikey: API_KEY },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    const rows = normalizeInstancesPayload(raw);
    const row = rows.find((r) => r.instanceName === INSTANCE);
    return row ?? null;
  } catch {
    return null;
  }
}

/** Igual à intenção do get-evolution-qr.ts: count 0 / 1 / undefined pede “empurrão”. */
function shouldRestartForQr(params: {
  hasImageQr: boolean;
  state: string | undefined;
  count: number | undefined;
}): boolean {
  const { hasImageQr, state, count } = params;
  if (hasImageQr) return false;
  if (state === "open") return false;
  if (state === "connecting") return false;
  if (state === "close") return true;
  if (count === 0 || count === undefined || count === 1) return true;
  return false;
}

function humanError(
  status: number,
  text: string,
  parsed: unknown,
): { message: string; hint?: string } {
  if (status === 401)
    return {
      message: "Não autorizado (401)",
      hint: "EVOLUTION_API_KEY não bate com AUTHENTICATION_API_KEY da Evolution.",
    };
  if (status === 404) {
    return {
      message: `Instância não encontrada (${status})`,
      hint: `Nome usado: "${INSTANCE}". Confirme na Evolution (fetchInstances ou manager) e alinhe EVOLUTION_INSTANCE_NAME — hífen vs underscore importa.`,
    };
  }
  return { message: `Evolution HTTP ${status}`, hint: text.slice(0, 200) };
}

function htmlPage(): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlowOS — QR WhatsApp (Evolution)</title>
</head>
<body style="margin:0;background:#0a0a0a;color:#e5e5e5;font-family:system-ui,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh">
  <h2 style="margin-bottom:0.5rem">FlowOS — QR WhatsApp</h2>
  <p style="color:#888;font-size:14px;margin-top:0">${INSTANCE} · porta <strong>${liveListenPort || "…"}</strong> · atualiza a cada 30s</p>
  <p style="color:#666;font-size:12px;margin-top:-0.5rem;max-width:400px;text-align:center">A URL desta aba tem de ser a mesma que o terminal (feche outros <code style="color:#888">evolution:qr-live</code> antigos).</p>
  <img id="qr" alt="QR" style="display:none;width:300px;height:300px;background:#111;border-radius:8px" />
  <p id="pairline" style="display:none;color:#fde047;font-size:1.35rem;font-weight:600;letter-spacing:0.12em;margin:0.5rem 0;max-width:90vw;text-align:center"></p>
  <p id="v2hint" style="display:none;color:#737373;font-size:12px;max-width:420px;text-align:center;margin:0">Evolution v2 (REST) muitas vezes só envia código de pareamento — use no WhatsApp: Definições → Aparelhos ligados → Ligar com número.</p>
  <p id="status" style="color:#aaa;margin-top:1rem">Carregando…</p>
  <p id="err" style="color:#f87171;max-width:420px;text-align:center;font-size:13px"></p>
  <script>
    const elQr = document.getElementById("qr");
    const elPair = document.getElementById("pairline");
    const elV2 = document.getElementById("v2hint");
    const elSt = document.getElementById("status");
    const elEr = document.getElementById("err");
    let timer = null;

    async function tick() {
      elEr.innerText = "";
      elSt.innerText = "Buscando QR…";
      elPair.style.display = "none";
      elPair.innerText = "";
      elV2.style.display = "none";
      try {
        const r = await fetch("/api/evolution-connect", { cache: "no-store" });
        const data = await r.json();
        if (!data.success) {
          elEr.innerText = [data.error, data.hint].filter(Boolean).join(" — ");
          elSt.innerText = "Erro — nova tentativa em 10s";
          elQr.style.display = "none";
          elQr.removeAttribute("src");
          timer = setTimeout(tick, 10_000);
          return;
        }
        const raw = data.base64;
        if (raw) {
          elQr.src = raw.startsWith("data:") ? raw : "data:image/png;base64," + raw;
          elQr.style.display = "block";
          elSt.innerText = "Escaneie agora — próximo refresh em 30s";
          timer = setTimeout(tick, 30_000);
          return;
        }
        if (data.state === "open" || data.instance?.state === "open") {
          elSt.innerText = "Conectado — pode fechar esta página.";
          elQr.style.display = "none";
          return;
        }
        const pc = data.pairingCode != null && String(data.pairingCode).length > 0
          ? String(data.pairingCode)
          : "";
        if (data.diagnostics?.tip) {
          const ba =
            typeof data.diagnostics.burstAttempts === "number"
              ? " Tentativas de connect neste pedido: " + data.diagnostics.burstAttempts + "."
              : "";
          elV2.innerText =
            data.diagnostics.tip +
            ba +
            (Array.isArray(data.diagnostics.connectKeys) && data.diagnostics.connectKeys.length
              ? " Resposta (chaves): " + data.diagnostics.connectKeys.join(", ") + "."
              : "") +
            (data.diagnostics.fetchInstances
              ? " fetchInstances: " + data.diagnostics.fetchInstances + "."
              : "");
          elV2.style.display = "block";
        }
        if (pc) {
          elPair.innerText = pc;
          elPair.style.display = "block";
          if (!data.diagnostics?.tip) elV2.style.display = "block";
        }
        const bits = [];
        if (pc) bits.push("Introduz este código no WhatsApp (ligar com número)");
        if (data.kickedRestart) {
          bits.push("Reinício na Evolution — a gerar sessão (~15s)");
        }
        elSt.innerText =
          bits.length > 0
            ? bits.join(" · ") + " — nova tentativa em 8s"
            : "Sem QR PNG ainda (v2 REST pode ser só código) — nova tentativa em 8s";
        elQr.style.display = "none";
        timer = setTimeout(tick, 8_000);
      } catch (e) {
        elEr.innerText = String(e);
        elSt.innerText = "Falha de rede — nova tentativa em 10s";
        timer = setTimeout(tick, 10_000);
      }
    }
    tick();
  </script>
</body>
</html>`;
}

function buildSuccessBody(params: {
  parsed: Record<string, unknown>;
  base64: string | undefined;
  state: string | undefined;
  kickedRestart?: boolean;
  burstAttempts?: number;
  fetchInstancesRow?: { instanceName: string; state: string } | null;
}): string {
  const {
    parsed,
    base64,
    state,
    kickedRestart,
    burstAttempts = 1,
    fetchInstancesRow,
  } = params;
  const inst = parsed["instance"];
  const pairingCode = extractPairingCode(parsed);
  const hasDisplay =
    !!base64 || (pairingCode != null && String(pairingCode).length > 0);
  const connectUsesNumberParam =
    env("EVOLUTION_CONNECT_NUMBER", "").replace(/\D/g, "").length >= 10;

  const fetchInstancesLabel =
    fetchInstancesRow != null
      ? `“${fetchInstancesRow.instanceName}” → ${fetchInstancesRow.state}`
      : !hasDisplay
        ? "instância não encontrada na lista ou fetchInstances falhou"
        : undefined;

  return JSON.stringify({
    success: true,
    base64,
    state,
    instance: inst,
    pairingCode,
    ...(kickedRestart ? { kickedRestart: true } : {}),
    ...(!hasDisplay
      ? {
          diagnostics: {
            connectKeys: Object.keys(parsed),
            count: extractCount(parsed),
            connectUsesNumberParam,
            burstAttempts,
            ...(fetchInstancesLabel ? { fetchInstances: fetchInstancesLabel } : {}),
            tip: connectUsesNumberParam
              ? `Sem QR/código após ${burstAttempts} chamada(s) ao connect (rajada no servidor). Na Railway/Evolution: variáveis CONFIG_SESSION_PHONE_CLIENT, CONFIG_SESSION_PHONE_NAME, CONFIG_SESSION_PHONE_VERSION (ver github.com/EvolutionAPI/evolution-api/issues/1220); pairing pode exigir instância criada com o número na mesma hora; senão atualize a imagem da API (v2.2.x).`
              : "Para v2.2.x: adicione EVOLUTION_CONNECT_NUMBER (DDI+DDD+número, só dígitos) em apps/web/.env.local e reinicie este script — força ?number= no connect.",
          },
        }
      : {}),
  });
}

async function proxyConnect(): Promise<{ status: number; body: string }> {
  if (!API_KEY) {
    return {
      status: 200,
      body: JSON.stringify({
        success: false,
        error: "EVOLUTION_API_KEY ausente",
        hint: "Defina em apps/web/.env.local ou no ambiente antes de pnpm evolution:qr-live",
      }),
    };
  }

  const first = await fetchConnectBurst();
  let { parsed, status: resStatus, text } = first;
  let burstAttempts = first.burstAttempts;

  if (!resStatus || resStatus < 200 || resStatus >= 300) {
    const { message, hint } = humanError(resStatus, text, parsed);
    return {
      status: 200,
      body: JSON.stringify({
        success: false,
        error: message,
        hint,
        evolutionHttpStatus: resStatus,
        connectPath: `/instance/connect/${INSTANCE}`,
      }),
    };
  }

  if (!parsed) {
    return {
      status: 200,
      body: JSON.stringify({
        success: false,
        error: "Resposta da Evolution não é JSON",
        hint: text.slice(0, 200),
      }),
    };
  }

  let base64 = pickQrBase64(parsed);
  let state = extractState(parsed) ?? (await fetchConnectionStateLabel());
  let count = extractCount(parsed);
  let kickedRestart = false;

  const wantRestart = shouldRestartForQr({
    hasImageQr: !!base64,
    state,
    count,
  });

  if (wantRestart) {
    const cooldownOk = Date.now() - lastRestartMs >= RESTART_COOLDOWN_MS;
    if (!restartPromise && cooldownOk) {
      lastRestartMs = Date.now();
      kickedRestart = true;
      console.log(
        `  [evolution-qr-live] POST restart ${INSTANCE} + aguardar 12s (pedidos paralelos partilham este passo)…`,
      );
      restartPromise = (async () => {
        try {
          await evolutionRestartInstance();
          await new Promise((r) => setTimeout(r, 12_000));
        } finally {
          restartPromise = null;
        }
      })();
    }

    if (restartPromise) {
      try {
        await restartPromise;
      } catch (e) {
        return {
          status: 200,
          body: JSON.stringify({
            success: false,
            error: "Falha ao reiniciar instância na Evolution",
            hint: e instanceof Error ? e.message : String(e),
          }),
        };
      }
      const second = await fetchConnectBurst();
      if (second.status >= 200 && second.status < 300 && second.parsed) {
        parsed = second.parsed;
        base64 = pickQrBase64(parsed);
        state =
          extractState(parsed) ?? (await fetchConnectionStateLabel()) ?? state;
        burstAttempts = Math.max(burstAttempts, second.burstAttempts);
      }
    }
  }

  const pairingForDisplay = extractPairingCode(parsed);
  const hasDisplay =
    !!base64 ||
    (pairingForDisplay != null && String(pairingForDisplay).length > 0);
  const fetchInstancesRow = !hasDisplay ? await fetchInstanceSnapshot() : null;

  return {
    status: 200,
    body: buildSuccessBody({
      parsed,
      base64,
      state,
      kickedRestart,
      burstAttempts,
      fetchInstancesRow,
    }),
  };
}

function createApp(): http.Server {
  return http.createServer(async (req, res) => {
    const u = req.url ?? "/";
    if (u === "/" || u === "/index.html") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      });
      res.end(htmlPage());
      return;
    }
    if (u === "/api/evolution-connect") {
      try {
        const result = await proxyConnect();
        res.writeHead(result.status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(result.body);
      } catch (e) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      }
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });
}

function listenWithFallback(base: number): void {
  const candidates = [...Array.from({ length: 10 }, (_, i) => base + i), 0];
  let i = 0;

  const tryListen = (): void => {
    if (i >= candidates.length) {
      console.error("Não foi possível abrir nenhuma porta local (48763+ ou efémera).");
      process.exit(1);
    }
    const port = candidates[i]!;
    i += 1;
    const server = createApp();
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && i < candidates.length) {
        if (port !== 0) {
          console.warn(`  Porta ${port} em uso — a tentar a seguinte…`);
        }
        tryListen();
        return;
      }
      console.error(err);
      process.exit(1);
    });
    server.listen(port, HOST, () => {
      const addr = server.address();
      const actual =
        typeof addr === "object" && addr !== null ? addr.port : port;
      liveListenPort = actual;
      console.log("\n  Evolution QR live — abra no browser:\n");
      console.log(`    http://${HOST}:${actual}/\n`);
      console.log(`  Instância: ${INSTANCE}`);
      console.log(`  Connect: ${buildConnectUrl().replace(API_URL, "").slice(0, 120)}`);
      if (env("EVOLUTION_CONNECT_NUMBER", "").replace(/\D/g, "").length < 10) {
        console.log(
          "  Dica v2.2.x: se o connect vier vazio, defina EVOLUTION_CONNECT_NUMBER em .env.local (?number= workaround).\n",
        );
      } else console.log("");
      console.log("  Ctrl+C para encerrar. A chave não sai deste processo (só proxy local).\n");
    });
  };

  tryListen();
}

listenWithFallback(preferredPort());
