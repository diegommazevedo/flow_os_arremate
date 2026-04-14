/**
 * POST /api/vistoria/[token]/upload — upload de evidência (foto/vídeo/áudio/texto)
 * Rota pública — sem sessão, autenticada por pwaAccessToken.
 * [SEC-08] sanitizar nome do arquivo.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { EvidenceType } from "@flow-os/db";

type Params = { params: Promise<{ token: string }> };

const ITEM_TO_EVIDENCE: Record<string, EvidenceType> = {
  fach: "PHOTO_EXTERIOR",
  viz: "PHOTO_SURROUNDINGS",
  acc: "PHOTO_ACCESS",
  fund: "PHOTO_EXTERIOR",
  vext: "VIDEO_EXTERIOR",
  vint: "VIDEO_SURROUNDINGS",
  audio: "AUDIO_DESCRIPTION",
  text: "DOCUMENT_PHOTO",
};

const MAX_SIZES: Record<string, number> = {
  "image/": 20 * 1024 * 1024,
  "video/": 100 * 1024 * 1024,
  "audio/": 20 * 1024 * 1024,
  "text/": 1 * 1024 * 1024,
};

function getMaxSize(mime: string): number {
  for (const [prefix, max] of Object.entries(MAX_SIZES)) {
    if (mime.startsWith(prefix)) return max;
  }
  return 20 * 1024 * 1024;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    select: { id: true, workspaceId: true, dealId: true, status: true },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  if (assignment.status === "COMPLETED") {
    return NextResponse.json({ error: "Vistoria já concluída" }, { status: 400 });
  }

  const formData = await req.formData();
  const itemId = String(formData.get("itemId") ?? "");
  const file = formData.get("file");
  const gpsLat = formData.get("gpsLat");
  const gpsLng = formData.get("gpsLng");
  const duration = formData.get("duration");

  if (!itemId || !file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "itemId e file obrigatórios" }, { status: 400 });
  }

  // Validar tamanho
  const maxSize = getMaxSize(file.type);
  if (file.size > maxSize) {
    return NextResponse.json({ error: `Arquivo muito grande (máx ${Math.round(maxSize / 1024 / 1024)}MB)` }, { status: 400 });
  }

  // Determinar tipo de evidência
  const evidenceType = ITEM_TO_EVIDENCE[itemId] ?? "DOCUMENT_PHOTO";

  // Sanitizar nome do arquivo [SEC-08]
  const ext = (file instanceof File ? file.name : "file").split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") ?? "bin";
  const safeKey = `${assignment.workspaceId}/vistoria/${assignment.id}/${itemId}-${Date.now()}.${ext}`;

  // Upload para MinIO/S3
  let mediaUrl = "";
  let mediaKey = safeKey;
  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      endpoint: process.env["MINIO_ENDPOINT"] ?? process.env["S3_ENDPOINT"] ?? "http://localhost:9000",
      region: process.env["S3_REGION"] ?? "us-east-1",
      credentials: {
        accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? process.env["S3_ACCESS_KEY"] ?? "minioadmin",
        secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? process.env["S3_SECRET_KEY"] ?? "minioadmin",
      },
      forcePathStyle: true,
    });
    const bucket = process.env["S3_BUCKET"] ?? "flowos";
    const arrayBuffer = await file.arrayBuffer();
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: safeKey,
      Body: Buffer.from(arrayBuffer),
      ContentType: file.type,
    }));
    mediaUrl = `${process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000"}/${bucket}/${safeKey}`;
  } catch (err) {
    console.error("[vistoria/upload] Erro S3:", err);
    return NextResponse.json({ error: "Erro no upload" }, { status: 500 });
  }

  const existingSameItem = await db.fieldEvidence.findMany({
    where: { assignmentId: assignment.id, description: itemId },
    select: { id: true },
  });
  if (existingSameItem.length > 0) {
    await db.fieldEvidence.deleteMany({
      where: { assignmentId: assignment.id, description: itemId },
    });
    await db.fieldAssignment.update({
      where: { id: assignment.id },
      data: { evidenceCount: { decrement: existingSameItem.length } },
    });
  }

  // Criar FieldEvidence
  await db.fieldEvidence.create({
    data: {
      workspaceId: assignment.workspaceId,
      assignmentId: assignment.id,
      dealId: assignment.dealId,
      type: evidenceType,
      mediaUrl,
      mediaKey,
      mimeType: file.type,
      description: itemId,
      aiAnalysis: {
        gpsLat: gpsLat ? Number(gpsLat) : null,
        gpsLng: gpsLng ? Number(gpsLng) : null,
        duration: duration ? Number(duration) : null,
        itemId,
      },
    },
  });

  // Incrementar evidenceCount
  await db.fieldAssignment.update({
    where: { id: assignment.id },
    data: { evidenceCount: { increment: 1 } },
  });

  return NextResponse.json({ ok: true, mediaUrl, itemId });
}
