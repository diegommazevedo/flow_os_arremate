/**
 * POST /api/portal/upload-document
 *
 * Upload de documento pelo portal do cliente ou pelo backoffice autenticado.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db, Prisma } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getPortalSession } from "@/lib/portal-auth";
import { getSessionContext } from "@/lib/session";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);
const ALLOWED_EXTS = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
]);

const PRESIGN_TTL_SECONDS = 7 * 24 * 60 * 60;

let s3Client: S3Client | null = null;

function getStorageEnv() {
  const endpoint = process.env["MINIO_ENDPOINT"];
  const publicUrl = process.env["MINIO_PUBLIC_URL"];
  const accessKeyId = process.env["MINIO_ACCESS_KEY"];
  const secretAccessKey = process.env["MINIO_SECRET_KEY"];

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("MINIO storage not configured (MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY).");
  }

  return {
    endpoint,
    publicUrl,
    accessKeyId,
    secretAccessKey,
    region: process.env["MINIO_REGION"] ?? "us-east-1",
    bucket: process.env["MINIO_BUCKET"] ?? "flowos",
  };
}

function getS3(): S3Client {
  if (s3Client) return s3Client;
  const env = getStorageEnv();
  s3Client = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    forcePathStyle: true,
  });
  return s3Client;
}

function getBucket(): string {
  return getStorageEnv().bucket;
}

function toSlug(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function resolveAuditAgentId(workspaceId: string): Promise<string | null> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return agent?.id ?? null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startMs = Date.now();
  const portalSession = await getPortalSession();
  const appSession = await getSessionContext();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  const dealId = String(formData.get("dealId") ?? "").trim();
  const checklistItemId = defaultSanitizer.clean(
    String(formData.get("checklistItemId") ?? formData.get("docLabel") ?? "").trim(),
  );

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' obrigatório" }, { status: 400 });
  }

  if (!dealId) {
    return NextResponse.json({ error: "Campo 'dealId' obrigatório" }, { status: 400 });
  }

  if (!portalSession.ok && !appSession) {
    return NextResponse.json({ error: "Sessão inválida. Faça login novamente." }, { status: 401 });
  }

  if (portalSession.ok && portalSession.session.dealId !== dealId) {
    return NextResponse.json({ error: "Acesso não autorizado a este processo." }, { status: 403 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande. O limite é 10 MB." }, { status: 413 });
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Tipo de arquivo não aceito. Envie PDF, JPG ou PNG." }, { status: 400 });
  }

  let workspaceId = appSession?.workspaceId ?? null;
  if (!workspaceId && portalSession.ok) {
    const sessionDeal = await db.deal.findFirst({
      where: { id: portalSession.session.dealId },
      select: { workspaceId: true },
    });
    workspaceId = sessionDeal?.workspaceId ?? null;
  }

  if (!workspaceId) {
    return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  }

  const deal = await db.deal.findFirst({
    where: { id: dealId, workspaceId },
    select: { id: true, workspaceId: true, meta: true },
  });

  if (!deal) {
    return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  }

  if (!portalSession.ok && appSession?.workspaceId !== deal.workspaceId) {
    return NextResponse.json({ error: "Acesso não autorizado a este workspace." }, { status: 403 });
  }

  const actorId = portalSession.ok ? portalSession.session.actorId : (appSession?.userId ?? "app-session");
  const actorName = defaultSanitizer.clean(portalSession.ok ? portalSession.session.actorName : "Equipe interna");
  const ext = ALLOWED_EXTS.get(contentType) ?? "bin";
  const safeFileName = defaultSanitizer.clean(file.name);
  const slug = toSlug(checklistItemId || safeFileName);
  const timestamp = Date.now();
  const s3Key = `${deal.workspaceId}/${deal.id}/docs/${slug}-${timestamp}.${ext}`;
  let bucket: string;
  try {
    bucket = getBucket();
  } catch (error) {
    console.error("[upload-document] MinIO env error:", error);
    return NextResponse.json({ error: "Storage não configurado no servidor." }, { status: 503 });
  }

  try {
    await getS3().send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: contentType,
      Metadata: {
        dealId: deal.id,
        workspaceId: deal.workspaceId,
        checklistItemId: checklistItemId || "unknown",
        actorId,
        originalName: encodeURIComponent(safeFileName),
      },
    }));
  } catch (error) {
    console.error("[upload-document] MinIO upload error:", error);
    return NextResponse.json({ error: "Falha ao salvar o arquivo. Tente novamente." }, { status: 502 });
  }

  const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000);
  let fileUrl: string;

  try {
    await getSignedUrl(
      getS3(),
      new PutObjectCommand({ Bucket: bucket, Key: s3Key, ContentType: contentType }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    const publicBaseUrl = getStorageEnv().publicUrl?.replace(/\/$/, "");
    fileUrl = publicBaseUrl
      ? `${publicBaseUrl}/${bucket}/${s3Key}`
      : `/api/portal/docs/${encodeURIComponent(s3Key)}`;
  } catch {
    fileUrl = `/api/portal/docs/${encodeURIComponent(s3Key)}`;
  }

  const document = await db.document.create({
    data: {
      workspaceId: deal.workspaceId,
      dealId: deal.id,
      name: safeFileName,
      url: fileUrl,
      contentType,
      collection: "deal_docs",
      sizeBytes: file.size,
      expiresAt,
      meta: {
        checklistItemId: checklistItemId || null,
        s3Key,
        actorId,
        actorName,
        slug,
      },
    },
    select: { id: true },
  });

  if (checklistItemId) {
    const currentMeta = (deal.meta ?? {}) as Prisma.JsonObject;
    const documents = ((currentMeta["documents"] ?? {}) as Prisma.JsonObject);
    await db.deal.update({
      where: { id: deal.id },
      data: {
        meta: {
          ...currentMeta,
          documents: {
            ...documents,
            [toSlug(checklistItemId)]: "uploaded",
          },
        } as Prisma.InputJsonObject,
      },
    }).catch((error) => {
      console.warn("[upload-document] Deal.meta update failed:", error);
    });
  }

  const auditAgentId = await resolveAuditAgentId(deal.workspaceId);
  if (auditAgentId) {
    await db.agentAuditLog.create({
      data: {
        workspaceId: deal.workspaceId,
        agentId: auditAgentId,
        action: "portal.document_upload",
        input: {
          dealId: deal.id,
          checklistItemId: checklistItemId || null,
          fileName: safeFileName,
          sizeBytes: file.size,
          contentType,
          actorId,
        },
        output: {
          dealId: deal.id,
          documentId: document.id,
          s3Key,
          success: true,
        },
        modelUsed: "none",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: Date.now() - startMs,
        success: true,
      },
    }).catch((error) => {
      console.warn("[upload-document] AuditLog failed:", error);
    });
  }

  return NextResponse.json({
    ok: true,
    documentId: document.id,
    url: fileUrl,
  });
}
