/**
 * POST /api/media/upload
 * FormData campo "file" → MinIO via uploadToStorage.
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, getSessionContextFromBearer } from "@/lib/session";
import { uploadToStorage } from "@/lib/chat-media-storage";

const MAX_BYTES = 25 * 1024 * 1024;

function allowedMime(mime: string): boolean {
  const m = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (m === "application/pdf") return true;
  if (m.startsWith("image/")) return true;
  if (m.startsWith("video/")) return true;
  if (m.startsWith("audio/")) return true;
  return false;
}

export async function POST(request: NextRequest) {
  const cookieCtx = await getSessionContext();
  const bearerCtx = cookieCtx
    ? null
    : await getSessionContextFromBearer(request.headers.get("authorization"));
  const ctx = cookieCtx ?? bearerCtx;
  if (!ctx?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Campo file obrigatório" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  if (!allowedMime(contentType)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 415 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 25 MB)" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const { url } = await uploadToStorage({
      workspaceId: ctx.workspaceId,
      buffer: buf,
      contentType,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[api/media/upload]", e);
    return NextResponse.json({ error: "Falha ao enviar arquivo" }, { status: 500 });
  }
}
