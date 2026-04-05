/**
 * Middleware (Edge) — rastreio de requisições para diagnóstico.
 * Escrita em disco só ocorre em rotas Node (`/api/devops/logs`); aqui apenas propaga `x-flowos-request-id`.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function applyMiddlewareDiagnostics(request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-flowos-request-id", requestId);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-flowos-request-id", requestId);
  return res;
}
