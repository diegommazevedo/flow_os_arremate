/**
 * FlowOS v4 — Portal Auth
 *
 * Magic link JWT flow:
 *   1. Gera token: signPortalToken({ dealId, actorId, actorName })
 *   2. Envia link: /portal/[token]
 *   3. Valida token: verifyPortalToken(token)
 *   4. Cria session cookie: createPortalSession(payload)
 *   5. Lê sessão: getPortalSession()
 *
 * Invariantes:
 *   [SEC-01] Cookies httpOnly + SameSite:Strict
 *   [SEC-08] Nunca logar PII completo
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

// ─── Constantes ──────────────────────────────────────────────────────────────

const MAGIC_SECRET = new TextEncoder().encode(
  process.env["PORTAL_JWT_SECRET"] ?? "dev-secret-change-in-production",
);
const SESSION_SECRET = new TextEncoder().encode(
  process.env["PORTAL_SESSION_SECRET"] ?? "dev-session-secret-change-in-production",
);

const MAGIC_TTL_HOURS = 24;
const SESSION_TTL_DAYS = 7;
const SESSION_COOKIE   = "portal_session";
const ISSUER           = "flowos:portal";
const AUDIENCE         = "portal:client";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MagicTokenPayload {
  dealId:    string;
  actorId:   string;
  actorName: string;
}

export interface PortalSession extends MagicTokenPayload {
  sessionId: string;
}

export type TokenVerifyResult =
  | { valid: true;  payload: MagicTokenPayload }
  | { valid: false; reason: string };

export type SessionResult =
  | { ok: true;  session: PortalSession }
  | { ok: false; reason: string };

// ─── Magic Token ─────────────────────────────────────────────────────────────

/**
 * Gera o JWT do magic link (assinado com PORTAL_JWT_SECRET).
 * TTL: 24h.
 */
export async function signPortalToken(payload: MagicTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAGIC_TTL_HOURS}h`)
    .sign(MAGIC_SECRET);
}

/**
 * Verifica o JWT do magic link.
 * Retorna payload se válido, ou razão do erro.
 */
export async function verifyPortalToken(token: string): Promise<TokenVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, MAGIC_SECRET, {
      issuer:   ISSUER,
      audience: AUDIENCE,
    });

    const { dealId, actorId, actorName } = payload as JWTPayload & MagicTokenPayload;

    if (!dealId || !actorId || !actorName) {
      return { valid: false, reason: "Token incompleto" };
    }

    return { valid: true, payload: { dealId, actorId, actorName } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("expired"))   return { valid: false, reason: "Link expirado" };
    if (msg.includes("signature")) return { valid: false, reason: "Assinatura inválida" };
    return { valid: false, reason: "Link inválido" };
  }
}

// ─── Session Cookie ───────────────────────────────────────────────────────────

/**
 * Cria a session cookie httpOnly com TTL de 7 dias.
 * Deve ser chamado em Server Actions (nunca em Server Components durante render).
 */
export async function createPortalSession(payload: MagicTokenPayload): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: PortalSession = { ...payload, sessionId };

  const jwt = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(`${AUDIENCE}:session`)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(SESSION_SECRET);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, jwt, {
    httpOnly:  true,
    secure:    process.env["NODE_ENV"] === "production",
    sameSite:  "strict",
    path:      "/portal",
    maxAge:    60 * 60 * 24 * SESSION_TTL_DAYS,
  });

  return session.dealId;
}

/**
 * Lê e verifica a session cookie.
 * Usado no layout/page do portal para autenticar.
 */
export async function getPortalSession(): Promise<SessionResult> {
  try {
    const jar     = await cookies();
    const cookie  = jar.get(SESSION_COOKIE);
    if (!cookie) return { ok: false, reason: "Sessão não encontrada" };

    const { payload } = await jwtVerify(cookie.value, SESSION_SECRET, {
      issuer:   ISSUER,
      audience: `${AUDIENCE}:session`,
    });

    const session = payload as JWTPayload & PortalSession;
    if (!session.dealId || !session.actorId) {
      return { ok: false, reason: "Sessão inválida" };
    }

    return {
      ok: true,
      session: {
        dealId:    session.dealId,
        actorId:   session.actorId,
        actorName: session.actorName ?? "Arrematante",
        sessionId: session.sessionId ?? "",
      },
    };
  } catch {
    return { ok: false, reason: "Sessão expirada" };
  }
}
