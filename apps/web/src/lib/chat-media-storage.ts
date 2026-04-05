/**
 * Upload de buffers de mídia (webhook Evolution) para MinIO/S3.
 * Reutiliza credenciais MINIO_* do projeto.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    endpoint: process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000",
    region: process.env["MINIO_REGION"] ?? "us-east-1",
    credentials: {
      accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
      secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
    },
    forcePathStyle: true,
  });
  return s3Client;
}

function getBucket(): string {
  return process.env["MINIO_BUCKET"] ?? "flowos";
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
  const endpoint = (process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000").replace(/\/$/, "");
  const bucket = getBucket();
  return `${endpoint}/${bucket}/${s3Key}`;
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
