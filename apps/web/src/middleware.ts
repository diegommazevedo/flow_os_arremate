import type { NextRequest } from "next/server";
import { applyMiddlewareDiagnostics } from "@/middleware-error-logger";

export function middleware(request: NextRequest) {
  return applyMiddlewareDiagnostics(request);
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
