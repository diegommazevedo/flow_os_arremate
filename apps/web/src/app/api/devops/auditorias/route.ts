/**
 * GET — lista arquivos em `.logs/audit-violations/` (saídas de auditorias / Codex, etc.).
 * [SEC-02] Autenticado; papéis DEV | OWNER | ADMIN.
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
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowDevops(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dir = path.join(getMonorepoLogsRoot(), "audit-violations");
  try {
    const files = fs.readdirSync(dir).filter((n) => !n.startsWith("."));
    return NextResponse.json({
      ok: true,
      directory: dir,
      files,
      hint: "Use GET /api/devops/logs?category=audit-violations&file=<nome> para ler um arquivo.",
    });
  } catch {
    return NextResponse.json({ ok: true, directory: dir, files: [] as string[] });
  }
}
