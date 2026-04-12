/**
 * Operação Evolution — classificação de resposta do /instance/connect,
 * estado mínimo persistido em WorkspaceIntegration.config._flowosEvolutionOp,
 * circuit breaker (evitar clique infinito + estado zumbi).
 */

export type ConnectResponseClass =
  | "qr_payload"
  | "pairing_payload"
  | "connected_ok"
  | "empty_count_only"
  | "empty_object"
  | "unauthorized"
  | "timeout"
  | "malformed_payload"
  | "unknown";

export type EvolutionSessionState =
  | "idle"
  | "preflight"
  | "logging_out"
  | "restarting"
  | "awaiting_qr"
  | "qr_ready"
  | "connected"
  | "zombie"
  | "failed"
  | "degraded";

export type EvolutionOperationalState = {
  sessionState?: EvolutionSessionState;
  lastConnectAt?: string | null;
  lastConnectResponseClass?: ConnectResponseClass | null;
  lastConnectResponseKeys?: string[] | null;
  lastErrorMessage?: string | null;
  connectAttemptsWindowStartedAt?: string | null;
  emptyCountOnlyStreak?: number;
  failedConnectStreak?: number;
  zombieUntil?: string | null;
  breakerOpen?: boolean;
  breakerReason?: string | null;
  lastSuccessfulQrAt?: string | null;
  lastSuccessfulConnectAt?: string | null;
};

export const FLOWOS_EVOLUTION_OP_KEY = "_flowosEvolutionOp" as const;

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
export const EMPTY_COUNT_ONLY_BREAKER_THRESHOLD = 3;
export const FAILED_CONNECT_BREAKER_THRESHOLD = 4;

export function classifyHttpError(status: number): ConnectResponseClass {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 408 || status === 504 || status === 503) return "timeout";
  return "unknown";
}

/** Evolution v2 embute o payload útil em `data` / `response`. */
export function unwrapEvolutionBody(parsed: Record<string, unknown>): Record<string, unknown> {
  let out = { ...parsed };
  for (const key of ["data", "response"] as const) {
    const inner = out[key];
    if (inner && typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
      out = { ...out, ...(inner as Record<string, unknown>) };
    }
  }
  return out;
}

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
 * Extrai QR / pairing do corpo Evolution (mesmo critério que status/route antes deste módulo).
 */
export function pickQrForClient(data: Record<string, unknown>): string | null {
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

export function classifyEvolutionConnectBody(data: Record<string, unknown> | null): ConnectResponseClass {
  if (data === null) return "empty_object";

  const keys = Object.keys(data).filter((k) => data[k] !== undefined && data[k] !== null);
  if (keys.length === 0) return "empty_object";

  if (pickQrForClient(data) !== null) return "qr_payload";

  const pairing = data["pairingCode"];
  if (typeof pairing === "string" && pairing.length > 0) return "pairing_payload";

  const inst = data["instance"];
  if (inst && typeof inst === "object" && inst !== null) {
    const st = (inst as Record<string, unknown>)["state"];
    const s = typeof st === "string" ? st.toLowerCase() : "";
    if (s === "open" || s === "connected") return "connected_ok";
  }

  const conn = data["connectionStatus"];
  if (typeof conn === "string") {
    const c = conn.toLowerCase();
    if (c === "open" || c === "connected") return "connected_ok";
  }

  if (
    keys.length === 1 &&
    keys[0] === "count" &&
    (typeof data["count"] === "number" || typeof data["count"] === "string")
  ) {
    return "empty_count_only";
  }

  if (keys.every((k) => k === "count" || k === "status" || k === "error")) {
    if ("count" in data) return "empty_count_only";
  }

  return "unknown";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function getEvolutionOperational(config: unknown): EvolutionOperationalState {
  if (!isRecord(config)) return {};
  const raw = config[FLOWOS_EVOLUTION_OP_KEY];
  if (!isRecord(raw)) return {};
  const op: EvolutionOperationalState = {};
  const str = (k: string) => (typeof raw[k] === "string" ? raw[k] : undefined);
  const num = (k: string) => (typeof raw[k] === "number" && Number.isFinite(raw[k]) ? raw[k] : undefined);
  const bool = (k: string) => (typeof raw[k] === "boolean" ? raw[k] : undefined);
  const strArr = (k: string) =>
    Array.isArray(raw[k]) && raw[k].every((x) => typeof x === "string") ? (raw[k] as string[]) : undefined;

  const sessionStateRaw = str("sessionState");
  if (sessionStateRaw) op.sessionState = sessionStateRaw as EvolutionSessionState;

  op.lastConnectAt = str("lastConnectAt") ?? null;

  const classRaw = str("lastConnectResponseClass");
  if (classRaw) op.lastConnectResponseClass = classRaw as ConnectResponseClass;

  op.lastConnectResponseKeys = strArr("lastConnectResponseKeys") ?? null;
  op.lastErrorMessage = str("lastErrorMessage") ?? null;
  op.connectAttemptsWindowStartedAt = str("connectAttemptsWindowStartedAt") ?? null;

  const emptyN = num("emptyCountOnlyStreak");
  if (emptyN !== undefined) op.emptyCountOnlyStreak = emptyN;
  const failN = num("failedConnectStreak");
  if (failN !== undefined) op.failedConnectStreak = failN;

  op.zombieUntil = str("zombieUntil") ?? null;

  const bo = bool("breakerOpen");
  if (bo !== undefined) op.breakerOpen = bo;

  op.breakerReason = str("breakerReason") ?? null;
  op.lastSuccessfulQrAt = str("lastSuccessfulQrAt") ?? null;
  op.lastSuccessfulConnectAt = str("lastSuccessfulConnectAt") ?? null;
  return op;
}

export function mergeEvolutionOperationalIntoConfig(
  config: Record<string, unknown>,
  op: EvolutionOperationalState,
): Record<string, unknown> {
  const cleaned = Object.fromEntries(
    Object.entries(op).filter(([, v]) => v !== undefined),
  );
  return { ...config, [FLOWOS_EVOLUTION_OP_KEY]: cleaned };
}

/**
 * Expira breaker/janela de streaks conforme o relógio.
 */
export function normalizeOperationalStateClock(op: EvolutionOperationalState, now: Date): EvolutionOperationalState {
  const out = { ...op };
  if (out.zombieUntil) {
    const until = new Date(out.zombieUntil).getTime();
    if (Number.isFinite(until) && now.getTime() >= until) {
      out.breakerOpen = false;
      out.zombieUntil = null;
      out.breakerReason = null;
      if (out.sessionState === "zombie") out.sessionState = "idle";
    }
  }

  const started = out.connectAttemptsWindowStartedAt
    ? new Date(out.connectAttemptsWindowStartedAt).getTime()
    : NaN;
  if (!Number.isFinite(started) || now.getTime() - started > ATTEMPT_WINDOW_MS) {
    out.connectAttemptsWindowStartedAt = now.toISOString();
    out.emptyCountOnlyStreak = 0;
    out.failedConnectStreak = 0;
  }
  return out;
}

export function isBreakerBlocking(op: EvolutionOperationalState, now: Date): boolean {
  if (!op.breakerOpen || !op.zombieUntil) return false;
  const until = new Date(op.zombieUntil).getTime();
  return Number.isFinite(until) && now.getTime() < until;
}

/** Após resultado de um POST de QR. */
export function applyConnectAttemptResult(opts: {
  prev: EvolutionOperationalState;
  now: Date;
  result: { kind: "qr_success" } | { kind: "empty"; body: Record<string, unknown> | null; keys: string[] } | { kind: "http_fail"; status: number };
}): EvolutionOperationalState {
  const { prev, now, result } = opts;
  let op: EvolutionOperationalState = {
    ...prev,
    lastConnectAt: now.toISOString(),
  };

  if (result.kind === "qr_success") {
    op.sessionState = "qr_ready";
    op.lastConnectResponseClass = "qr_payload";
    op.lastConnectResponseKeys = null;
    op.lastErrorMessage = null;
    op.emptyCountOnlyStreak = 0;
    op.failedConnectStreak = 0;
    op.breakerOpen = false;
    op.breakerReason = null;
    op.zombieUntil = null;
    op.lastSuccessfulQrAt = now.toISOString();
    return op;
  }

  if (result.kind === "http_fail") {
    const cls = classifyHttpError(result.status);
    op.lastConnectResponseClass = cls;
    op.lastConnectResponseKeys = null;
    op.lastErrorMessage = `HTTP ${result.status}`;
    op.failedConnectStreak = (op.failedConnectStreak ?? 0) + 1;
    op.sessionState = cls === "unauthorized" ? "degraded" : "failed";
    if ((op.failedConnectStreak ?? 0) >= FAILED_CONNECT_BREAKER_THRESHOLD) {
      op.breakerOpen = true;
      op.breakerReason = "failed_connect_streak";
      op.zombieUntil = new Date(now.getTime() + BREAKER_COOLDOWN_MS).toISOString();
      op.sessionState = "zombie";
    }
    return op;
  }

  const cls = classifyEvolutionConnectBody(result.body);
  op.lastConnectResponseClass = cls;
  op.lastConnectResponseKeys = result.keys.length ? result.keys : null;
  op.lastErrorMessage = null;

  if (cls === "empty_count_only") {
    op.emptyCountOnlyStreak = (op.emptyCountOnlyStreak ?? 0) + 1;
  } else if (cls === "empty_object" || cls === "unknown" || cls === "malformed_payload") {
    op.failedConnectStreak = (op.failedConnectStreak ?? 0) + 1;
  }

  op.sessionState =
    cls === "connected_ok"
      ? "connected"
      : cls === "pairing_payload"
        ? "awaiting_qr"
        : cls === "empty_count_only" || cls === "empty_object"
          ? "failed"
          : "degraded";

  if ((op.emptyCountOnlyStreak ?? 0) >= EMPTY_COUNT_ONLY_BREAKER_THRESHOLD) {
    op.breakerOpen = true;
    op.breakerReason = "empty_count_only_repeated";
    op.zombieUntil = new Date(now.getTime() + BREAKER_COOLDOWN_MS).toISOString();
    op.sessionState = "zombie";
  } else if ((op.failedConnectStreak ?? 0) >= FAILED_CONNECT_BREAKER_THRESHOLD) {
    op.breakerOpen = true;
    op.breakerReason = "failed_connect_streak";
    op.zombieUntil = new Date(now.getTime() + BREAKER_COOLDOWN_MS).toISOString();
    op.sessionState = "zombie";
  }

  return op;
}

export function breakerUserMessage(reason: string | null | undefined): string {
  if (reason === "empty_count_only_repeated") {
    return "A Evolution respondeu várias vezes sem QR utilizável. Proteção ativa: nova tentativa bloqueada por alguns minutos. Verifique persistência (DATABASE_ENABLED), número (?number=) e logs da instância.";
  }
  if (reason === "failed_connect_streak") {
    return "Várias falhas seguidas ao contactar a Evolution. Proteção ativa: aguarde alguns minutos antes de tentar de novo ou valide URL/apikey.";
  }
  return "Instância temporariamente bloqueada para novas tentativas. Aguarde o fim da janela de recuperação.";
}

export function nextSuggestedActionForClass(
  cls: ConnectResponseClass | null | undefined,
  usedNumberParam: boolean,
): string {
  if (cls === "empty_count_only" || cls === "empty_object") {
    return usedNumberParam
      ? "Confirme DATABASE_ENABLED na Evolution, versão da imagem e logs; depois tente novamente após a janela de proteção."
      : "Defina EVOLUTION_CONNECT_NUMBER (ou connectNumber na integração) com o WhatsApp só em dígitos e redeploy do flowos-web.";
  }
  if (cls === "unauthorized") return "Alinhe EV Evolution_API_KEY com AUTHENTICATION_API_KEY no Railway.";
  if (cls === "timeout") return "Evolution ou rede lentos/indisponíveis — tente mais tarde.";
  return "Valide URL da API (sem /manager), nome da instância e estado no manager Evolution.";
}
