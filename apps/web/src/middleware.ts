/**
 * Middleware — Supabase session refresh + diagnósticos.
 *
 * Obrigatório para que cookies de autenticação sejam propagados entre
 * browser client e server components/actions.
 * Ref: https://supabase.com/docs/guides/auth/server-side/nextjs (middleware pattern)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // ── Diagnóstico ────────────────────────────────────────────────────────────
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-flowos-request-id", requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-flowos-request-id", requestId);

  // ── Supabase session refresh ───────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnon) {
    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Propaga cookies para o request (server components enxergam)
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // Recria response para carregar os headers atualizados
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.headers.set("x-flowos-request-id", requestId);
          // Seta cookies no response (browser persiste)
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    // getUser() dispara token refresh se expirado → setAll é chamado
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
