/**
 * /login — Página de autenticação
 *
 * Em desenvolvimento (sem Supabase configurado):
 *   → redireciona direto para /dashboard se DEFAULT_WORKSPACE_ID estiver definido.
 *
 * Em produção:
 *   → formulário Supabase (magic link ou email + senha).
 */

import { redirect } from "next/navigation";
import { getSessionWorkspaceId } from "@/lib/session";
import LoginClient from "./_components/LoginClient";

export const dynamic = "force-dynamic";

/** Next.js pode entregar o mesmo nome de query mais de uma vez → string | string[]. */
function firstParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Evita open redirect: só caminhos relativos ao site. */
function safeInternalPath(v: string | undefined, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s.startsWith("/") || s.startsWith("//")) return fallback;
  return s;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const sp = await searchParams;
  const nextRaw = firstParam(sp.next);
  const errorRaw = firstParam(sp.error);

  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
  const devWs = process.env["DEFAULT_WORKSPACE_ID"] ?? "";

  const next = safeInternalPath(nextRaw, "/dashboard");

  // Dev bypass: Supabase não configurado + DEFAULT_WORKSPACE_ID definido → acesso direto
  if (!supabaseUrl && devWs && process.env["NODE_ENV"] === "development") {
    redirect(next);
  }

  // Já autenticado → redireciona para destino (evita loop login↔dashboard)
  const existingSession = await getSessionWorkspaceId();
  if (existingSession) {
    redirect(next);
  }

  const hasSupabase = !!supabaseUrl;

  // hasSupabase resolvido no servidor evita hydration mismatch no cliente
  return (
    <LoginClient
      next={next}
      hasSupabase={hasSupabase}
      {...(errorRaw ? { callbackError: errorRaw } : {})}
    />
  );
}
