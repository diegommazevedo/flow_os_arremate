/**
 * Upload de buffers de mídia (webhook Evolution) para MinIO/S3.
 * Reutiliza credenciais MINIO_* do projeto.
 */

import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

function normalizeEndpoint(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `http://${raw}`;
}

function getS3(): S3Client {
  if (s3Client) return s3Client;
  const env = getStorageEnv();
  s3Client = new S3Client({
    endpoint: normalizeEndpoint(env.endpoint),
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

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
  "application/octet-stream": "bin",
};

export function extFromMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "application/octet-stream";
  return MIME_EXT[base] ?? "bin";
}

export function buildChatMediaPublicUrl(s3Key: string): string {
  const env = getStorageEnv();
  const baseUrl = (env.publicUrl || env.endpoint).replace(/\/$/, "");
  const bucket = getBucket();
  return `${baseUrl}/${bucket}/${s3Key}`;
}

/** Upload genérico (ex.: POST /api/media/upload) — MinIO/S3. */
export async function uploadToStorage(params: {
  workspaceId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ url: string }> {
  const messageId = `upload-${randomUUID()}`;
  const ext = extFromMime(params.contentType);
  const { url } = await uploadChatMediaBuffer({
    workspaceId: params.workspaceId,
    messageId,
    ext,
    contentType: params.contentType,
    buffer: params.buffer,
  });
  return { url };
}

export async function uploadChatMediaBuffer(params: {
  workspaceId: string;
  messageId: string;
  ext: string;
  contentType: string;
  buffer: Buffer;
}): Promise<{ s3Key: string; url: string }> {
  const safeExt = params.ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const s3Key = `${params.workspaceId}/chat-media/${params.messageId}.${safeExt}`;
  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: s3Key,
      Body: params.buffer,
      ContentType: params.contentType.split(";")[0]?.trim() ?? "application/octet-stream",
      Metadata: {
        workspaceId: params.workspaceId,
        messageId: params.messageId,
      },
    }),
  );
  return { s3Key, url: buildChatMediaPublicUrl(s3Key) };
}
