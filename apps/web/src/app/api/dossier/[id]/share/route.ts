/**
 * POST /api/dossier/[id]/share
 *
 * Compartilha o dossiê gerado com o lead via WA.
 *
 * [SEC-03] workspaceId da sessão autenticada.
 * [SEC-06] AuditLog: DOSSIER_SHARED_WITH_LEAD.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client(): S3Client {
  const endpoint = process.env["MINIO_ENDPOINT"];
  const accessKeyId = process.env["MINIO_ACCESS_KEY"];
  const secretAccessKey = process.env["MINIO_SECRET_KEY"];

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("MINIO storage not configured");
  }

  return new S3Client({
    endpoint: /^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`,
    region: process.env["MINIO_REGION"] ?? "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function generateSignedUrl(reportKey: string, expiresInSeconds = 7 * 24 * 60 * 60): Promise<string> {
  const client = getS3Client();
  const bucket = process.env["MINIO_BUCKET"] ?? "flowos";

  const command = new GetObjectCommand({ Bucket: bucket, Key: reportKey });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

async function resolveEvolutionInstance(workspaceId: string): Promise<{ instance: string; baseUrl: string; apiKey: string } | null> {
  const integration = await db.workspaceIntegration.findFirst({
    where: {
      workspaceId,
      type: "WHATSAPP_EVOLUTION",
      status: "ACTIVE",
    },
    select: { config: true },
  });

  if (!integration?.config) return null;
  const cfg = integration.config as Record<string, string>;

  return {
    instance: cfg["EVOLUTION_INSTANCE_NAME"] ?? "",
    baseUrl: (cfg["apiUrl"] ?? cfg["EVOLUTION_API_URL"] ?? process.env["EVOLUTION_API_URL"] ?? "http://localhost:8080").replace(/\/+$/, ""),
    apiKey: process.env["EVOLUTION_API_KEY"] ?? "",
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = session;
  const { id: dossierId } = await params;

  // 1. Buscar dossiê [SEC-03]
  const dossier = await db.propertyDossier.findFirst({
    where: { id: dossierId, workspaceId, status: "GENERATED" },
    include: {
      deal: {
        select: {
          id: true,
          contactId: true,
          contact: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  if (!dossier) {
    return NextResponse.json({ error: "Dossiê não encontrado ou não está no status GENERATED" }, { status: 404 });
  }

  const contact = dossier.deal.contact;
  if (!contact?.phone) {
    return NextResponse.json({ error: "Lead sem telefone cadastrado" }, { status: 400 });
  }

  // 2. Gerar signed URL (7 dias) se tiver report no MinIO
  let shareUrl = "";
  if (dossier.reportKey) {
    shareUrl = await generateSignedUrl(dossier.reportKey);
  } else if (dossier.reportUrl) {
    shareUrl = dossier.reportUrl;
  }

  // 3. Enviar via WA
  const evolution = await resolveEvolutionInstance(workspaceId);
  if (!evolution || !evolution.instance) {
    return NextResponse.json({ error: "Instância Evolution não configurada" }, { status: 500 });
  }

  const leadName = defaultSanitizer.clean(contact.name ?? "");
  const fieldScore = dossier.fieldScore ? Number(dossier.fieldScore).toFixed(1) : "N/A";

  const mensagem = [
    `Olá ${leadName}!`,
    "",
    "Seu dossiê do imóvel está pronto!",
    "",
    `📊 Score do imóvel: ${fieldScore}/10`,
    ...(shareUrl ? [`📋 Relatório completo: ${shareUrl}`, "", "Acesso disponível por 7 dias."] : []),
    ...(dossier.aiSummary ? ["", `📝 ${dossier.aiSummary}`] : []),
    "",
    "Dúvidas? Estamos aqui!",
  ].join("\n");

  const res = await fetch(`${evolution.baseUrl}/message/sendText/${evolution.instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evolution.apiKey,
    },
    body: JSON.stringify({
      number: contact.phone,
      text: mensagem,
      options: { delay: 1200, presence: "composing" },
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Falha ao enviar WA: ${res.status}` }, { status: 502 });
  }

  // 4. Atualizar dossiê
  await db.propertyDossier.update({
    where: { id: dossierId, workspaceId },
    data: {
      sharedWithLead: true,
      sharedAt: new Date(),
      status: "SHARED",
      clientId: contact.id,
    },
  });

  // 5. [SEC-06] AuditLog
  await appendAuditLog({
    workspaceId,
    action: "DOSSIER_SHARED_WITH_LEAD",
    input: {
      dossierId,
      dealId: dossier.dealId,
      contactId: contact.id,
      phoneSuffix: contact.phone.slice(-4),
    },
    output: {
      status: "SHARED",
      hasSignedUrl: Boolean(shareUrl),
      fieldScore: dossier.fieldScore ? Number(dossier.fieldScore) : null,
    },
  }).catch(() => undefined);

  return NextResponse.json({
    success: true,
    dossierId,
    sharedAt: new Date().toISOString(),
    shareUrl: shareUrl || null,
  });
}
