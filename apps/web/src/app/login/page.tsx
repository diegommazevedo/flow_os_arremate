/**
 * /login — Página de autenticação
 *
 * Em desenvolvimento (sem Supabase configurado):
 *   → redireciona direto para /dashboard se DEFAULT_WORKSPACE_ID estiver definido.
 *
 * Em produção:
 *   → formulário Supabase (magic link ou email + senha).
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import LoginClient  from "./_components/LoginClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
  const devWs       = process.env["DEFAULT_WORKSPACE_ID"] ?? "";

  // Dev bypass: Supabase não configurado + DEFAULT_WORKSPACE_ID definido → acesso direto
  if (!supabaseUrl && devWs && process.env["NODE_ENV"] === "development") {
    const { next } = await searchParams;
    redirect(next ?? "/dashboard");
  }

  const { next, error } = await searchParams;
  const hasSupabase     = !!supabaseUrl;

  // hasSupabase resolvido no servidor evita hydration mismatch no cliente
  return (
    <LoginClient
      next={next ?? "/dashboard"}
      hasSupabase={hasSupabase}
      {...(error ? { callbackError: error } : {})}
    />
  );
}
