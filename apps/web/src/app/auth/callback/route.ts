/**
 * GET /auth/callback
 *
 * Rota obrigatória do Supabase SSR — troca o `code` da URL por cookies de sessão.
 * Sem ela, o magic link redireciona para o app mas não persiste a sessão.
 *
 * Fluxo:
 *   1. Usuário clica no magic link → Supabase redireciona para /auth/callback?code=xxx&next=/dashboard
 *   2. Este handler troca o code por session via PKCE
 *   3. Cookies httpOnly de sessão são gravados
 *   4. Redirect para `next` (ou /dashboard)
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { cookies }                   from "next/headers";
import { createServerClient }        from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    // Sem code → redireciona para login com erro
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabaseUrl  = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.redirect(`${origin}/login?error=supabase_not_configured`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll:  () => cookieStore.getAll(),
      setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }>) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          if (options) {
            cookieStore.set(name, value, options);
            return;
          }
          cookieStore.set(name, value);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Sucesso — redireciona para o destino original
  // next já pode conter '/' no início; garantir que é relativo
  const destination = next.startsWith("/") ? `${origin}${next}` : `${origin}/${next}`;
  return NextResponse.redirect(destination);
}
