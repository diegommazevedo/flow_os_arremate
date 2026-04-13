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

const UPLOAD_LIMITS: Record<string, number> = {
  image:    25 * 1024 * 1024,  // 25 MB
  video:    64 * 1024 * 1024,  // 64 MB
  audio:    16 * 1024 * 1024,  // 16 MB
  document: 50 * 1024 * 1024,  // 50 MB
};

function mediaCategory(mime: string): "image" | "video" | "audio" | "document" | null {
  const m = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || m.includes("document") || m.includes("spreadsheet") ||
      m.includes("msword") || m.includes("officedocument")) return "document";
  return null;
}

function maxBytesForMime(mime: string): number {
  const cat = mediaCategory(mime);
  return cat ? (UPLOAD_LIMITS[cat] ?? 25 * 1024 * 1024) : 25 * 1024 * 1024;
}

function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("size") || msg.includes("limit") || msg.includes("too large")) {
      return NextResponse.json({ error: "Arquivo muito grande para upload", code: "FILE_TOO_LARGE" }, { status: 413 });
    }
    return NextResponse.json({ error: "Erro ao processar arquivo. Tente novamente", code: "FORM_PARSE_ERROR" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Campo file obrigatório", code: "NO_FILE" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  const category = mediaCategory(contentType);
  if (!category) {
    return NextResponse.json({
      error: "Formato não suportado. Use: JPG, PNG, MP4, PDF, OGG",
      code: "UNSUPPORTED_FORMAT",
    }, { status: 415 });
  }

  const limit = maxBytesForMime(contentType);
  if (file.size > limit) {
    return NextResponse.json({
      error: `Arquivo muito grande. Máximo permitido: ${formatMB(limit)}`,
      code: "FILE_TOO_LARGE",
    }, { status: 413 });
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
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
      return NextResponse.json({ error: "Upload demorou muito. Verifique sua conexão", code: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ error: "Erro de armazenamento. Tente novamente em instantes", code: "STORAGE_ERROR" }, { status: 500 });
  }
}
