/**
 * GET — lê o último `.logs/diagnose-report.md` gerado por `pnpm diagnose`.
 * [SEC-02] Autenticado; [SEC-03] papéis internos apenas.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getMonorepoLogsRoot } from "@/lib/diagnostics-log-root";
import { getSessionContext } from "@/lib/session";

function allowDevops(role: string | undefined): boolean {
  return role === "DEV" || role === "OWNER" || role === "ADMIN";
}

export async function GET(): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!allowDevops(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = path.join(getMonorepoLogsRoot(), "diagnose-report.md");
  try {
    const content = fs.readFileSync(file, "utf8");
    return NextResponse.json({ ok: true, path: file, content });
  } catch {
    return NextResponse.json({
      ok: false,
      error: "Relatorio nao encontrado. Execute `pnpm diagnose` na raiz do monorepo.",
      path: file,
      content: "",
    });
  }
}
