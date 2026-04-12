export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

function getStorageEnv() {
  const endpoint = process.env["MINIO_ENDPOINT"];
  const accessKeyId = process.env["MINIO_ACCESS_KEY"];
  const secretAccessKey = process.env["MINIO_SECRET_KEY"];

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    region: process.env["MINIO_REGION"] ?? "us-east-1",
    bucket: process.env["MINIO_BUCKET"] ?? "flowos",
  };
}

let s3Client: S3Client | null = null;

function getS3(): S3Client | null {
  if (s3Client) return s3Client;
  const env = getStorageEnv();
  if (!env) return null;
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

function extractS3KeyFromUrl(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const docsMarker = "/api/portal/docs/";

  const parsePath = (path: string): string | null => {
    if (path.includes(docsMarker)) {
      return decodeURIComponent(path.split(docsMarker)[1] ?? "");
    }
    const idx = path.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(path.slice(idx + marker.length));
    }
    return null;
  };

  try {
    const parsed = new URL(url);
    return parsePath(parsed.pathname);
  } catch {
    return parsePath(url.split("?")[0] ?? url);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId, docId } = await params;

  const document = await db.document.findFirst({
    where: {
      id: docId,
      dealId,
      workspaceId,
      deal: { workspaceId },
    },
    select: {
      id: true,
      url: true,
      meta: true,
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
  }

  const env = getStorageEnv();
  const s3 = getS3();

  if (env && s3) {
    const metaKey =
      document.meta &&
      typeof document.meta === "object" &&
      !Array.isArray(document.meta) &&
      typeof (document.meta as Record<string, unknown>)["s3Key"] === "string"
        ? ((document.meta as Record<string, unknown>)["s3Key"] as string)
        : null;

    const s3Key = metaKey || extractS3KeyFromUrl(document.url, env.bucket);

    if (s3Key) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: env.bucket,
            Key: s3Key,
          }),
        );
      } catch (error) {
        console.error("[delete-document] MinIO delete error:", error);
        return NextResponse.json({ error: "Falha ao remover arquivo no storage." }, { status: 502 });
      }
    }
  }

  await db.document.delete({
    where: { id: document.id },
  });

  return NextResponse.json({ success: true });
}
