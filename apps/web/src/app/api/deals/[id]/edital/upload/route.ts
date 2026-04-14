/**
 * POST /api/deals/[id]/edital/upload — upload manual de PDF do edital
 * [SEC-03] workspaceId. [SEC-08] sanitizar nome de arquivo.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: dealId } = await params;

  // Verificar que deal existe
  const deal = await db.deal.findFirst({
    where: { id: dealId, workspaceId },
    select: { id: true },
  });
  if (!deal) return NextResponse.json({ error: "Deal não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Arquivo PDF obrigatório" }, { status: 400 });
  }

  // Validar tipo
  if (!file.type.includes("pdf")) {
    return NextResponse.json({ error: "Apenas PDF aceito" }, { status: 400 });
  }

  // Upload para S3/MinIO
  const safeKey = `${workspaceId}/editais/${dealId}/edital-${Date.now()}.pdf`;
  let fileUrl = "";
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
    const buffer = Buffer.from(await file.arrayBuffer());
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: safeKey,
      Body: buffer,
      ContentType: "application/pdf",
    }));
    fileUrl = `${process.env["MINIO_ENDPOINT"] ?? "http://localhost:9000"}/${bucket}/${safeKey}`;
  } catch (err) {
    console.error("[edital/upload] S3 falhou:", err);
    return NextResponse.json({ error: "Erro no upload" }, { status: 500 });
  }

  // Upsert Edital
  const edital = await db.edital.upsert({
    where: { dealId },
    create: {
      workspaceId,
      dealId,
      sourceType: "UPLOAD",
      fileUrl,
      status: "PENDING",
    },
    update: {
      sourceType: "UPLOAD",
      fileUrl,
      status: "PENDING",
    },
  });

  // Enfileirar processamento
  try {
    const { enqueueEditalProcessing } = await import("@flow-os/brain/workers/edital-processor");
    const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    await enqueueEditalProcessing({ editalId: edital.id, workspaceId }, { url: redisUrl });
  } catch (err) {
    console.warn("[edital/upload] Falha ao enfileirar:", err);
  }

  return NextResponse.json({ ok: true, editalId: edital.id, status: "processing" });
}
