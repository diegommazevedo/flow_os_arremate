/**
 * GET — lista ou lê arquivos sob `.logs/<categoria>/`.
 * POST — anexa entrada JSON em `.logs/runtime-errors/` (ex.: erros reportados pelo app).
 * [SEC-02] Autenticado; [SEC-11] sem PII no corpo — validar tamanho.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getMonorepoLogsRoot } from "@/lib/diagnostics-log-root";
import { getSessionContext } from "@/lib/session";

const CATEGORIES = [
  "build-errors",
  "runtime-errors",
  "audit-violations",
  "bug-reports",
  "fixes-applied",
] as const;

type Category = (typeof CATEGORIES)[number];

function allowDevops(role: string | undefined): boolean {
  return role === "DEV" || role === "OWNER" || role === "ADMIN";
}

function safeCategory(c: string | null): Category | null {
  return CATEGORIES.includes(c as Category) ? (c as Category) : null;
}

function safeFilePath(category: Category, name: string): string | null {
  if (name.includes("..") || path.isAbsolute(name)) return null;
  const base = path.resolve(path.join(getMonorepoLogsRoot(), category));
  const resolved = path.resolve(base, name);
  const rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

const PostBodySchema = z.object({
  message: z.string().max(8_000),
  context: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().max(128).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowDevops(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const category = safeCategory(searchParams.get("category"));
  if (!category) {
    return NextResponse.json(
      { error: "category obrigatoria", allowed: CATEGORIES },
      { status: 400 },
    );
  }

  const file = searchParams.get("file");
  const base = path.join(getMonorepoLogsRoot(), category);

  if (!file) {
    try {
      const names = fs.readdirSync(base).filter((n) => !n.startsWith("."));
      return NextResponse.json({ ok: true, category, files: names });
    } catch {
      return NextResponse.json({ ok: true, category, files: [] as string[] });
    }
  }

  const full = safeFilePath(category, file);
  if (!full) return NextResponse.json({ error: "Caminho invalido" }, { status: 400 });

  try {
    const content = fs.readFileSync(full, "utf8");
    return NextResponse.json({ ok: true, category, file, content });
  } catch {
    return NextResponse.json({ error: "Arquivo nao encontrado" }, { status: 404 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowDevops(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacao falhou", details: parsed.error.flatten() }, { status: 400 });
  }

  const dir = path.join(getMonorepoLogsRoot(), "runtime-errors");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = `api-${stamp}.jsonl`;
  const line = JSON.stringify({
    at: new Date().toISOString(),
    workspaceId: ctx.workspaceId,
    ...parsed.data,
  });
  fs.appendFileSync(path.join(dir, fname), `${line}\n`, "utf8");

  return NextResponse.json({ ok: true, file: fname });
}
