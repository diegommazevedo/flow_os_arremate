/**
 * POST multipart — PDF checklist item → MinIO + fila dossier-doc-processor (SEC-03, SEC-08).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db, type Prisma } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { enqueueDossierDoc } from "@flow-os/brain/workers/dossier-doc-processor";

const MAX_BYTES = 20 * 1024 * 1024;

function getS3(): S3Client {
  const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
  if (!endpoint) throw new Error("MINIO_ENDPOINT");
  const normalized = /^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`;
  return new S3Client({
    endpoint: normalized,
    region: process.env["MINIO_REGION"] ?? "us-east-1",
    credentials: {
      accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "",
      secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "",
    },
    forcePathStyle: true,
  });
}

type Params = { params: Promise<{ id: string; itemId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: dossierId, itemId } = await params;

  const dossier = await db.propertyDossier.findFirst({
    where: { id: dossierId, workspaceId },
    select: { id: true },
  });
  if (!dossier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const checklist = await db.dossierChecklist.findUnique({ where: { dossierId } });
  if (!checklist) return NextResponse.json({ error: "Checklist não encontrado" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Campo file obrigatório" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Apenas PDF" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Máximo 20MB" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const bucket = process.env["MINIO_BUCKET"] ?? "flowos";
  const key = `${workspaceId}/dossier/${dossierId}/docs/${itemId}.pdf`;
  const publicBase = (process.env["MINIO_PUBLIC_URL"] ?? process.env["MINIO_ENDPOINT"] ?? "").replace(/\/+$/, "");
  const fileUrl = `${publicBase}/${bucket}/${key}`;

  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: "application/pdf",
    }),
  );

  const items = checklist.items as Array<{
    id: string;
    label: string;
    required: boolean;
    status: string;
    fileUrl?: string;
  }>;
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return NextResponse.json({ error: "Item inválido" }, { status: 400 });

  const prev = items[idx]!;
  items[idx] = { ...prev, status: "uploaded", fileUrl };

  await db.dossierChecklist.update({
    where: { id: checklist.id },
    data: { items: items as unknown as Prisma.InputJsonValue },
  });

  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  await enqueueDossierDoc(
    { dossierId, itemId, fileUrl, workspaceId },
    { url: redisUrl },
  );

  return NextResponse.json({ ok: true, status: "processing" });
}
