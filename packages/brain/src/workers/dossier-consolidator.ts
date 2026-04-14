/**
 * Dossier Consolidator — relatório final após Gate A + Gate B (ou bypass).
 * Fila: dossier-consolidator
 *
 * shouldBypassGateB é a única fonte de verdade para bypass (Cartada 2).
 * [SEC-03] workspaceId em todas as queries.
 * [SEC-06] AuditLog DOSSIER_CONSOLIDATED.
 */

import { Worker, type ConnectionOptions } from "bullmq";
import { db } from "@flow-os/db";
import type { Edital } from "@flow-os/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DOSSIER_CONSOLIDATOR_QUEUE, type ConsolidateJobData } from "./dossier-consolidator-queue";

export { enqueueDossierConsolidation, DOSSIER_CONSOLIDATOR_QUEUE } from "./dossier-consolidator-queue";
export type { ConsolidateJobData } from "./dossier-consolidator-queue";

export interface DossierDeliverySettings {
  autoDispatchDossier?: boolean;
  autoDispatchDelayMinutes?: number;
  gateATimeoutHours?: number;
  gateBTimeoutHours?: number;
  reportFooterText?: string;
}

function parseWorkspaceDossierSettings(ws: { settings: unknown }): DossierDeliverySettings {
  const s = (ws.settings ?? {}) as Record<string, unknown>;
  const d = (s["dossier"] ?? s["dossierDelivery"]) as Record<string, unknown> | undefined;
  if (!d || typeof d !== "object") return { gateBTimeoutHours: 72 };
  const out: DossierDeliverySettings = {
    gateBTimeoutHours: typeof d["gateBTimeoutHours"] === "number" ? d["gateBTimeoutHours"] : 72,
  };
  if (typeof d["autoDispatchDossier"] === "boolean") out.autoDispatchDossier = d["autoDispatchDossier"];
  if (typeof d["autoDispatchDelayMinutes"] === "number") out.autoDispatchDelayMinutes = d["autoDispatchDelayMinutes"];
  if (typeof d["gateATimeoutHours"] === "number") out.gateATimeoutHours = d["gateATimeoutHours"];
  if (typeof d["reportFooterText"] === "string") out.reportFooterText = d["reportFooterText"];
  return out;
}

/** Única fonte de verdade para bypass do Gate B (não duplicar em S11). */
export function shouldBypassGateB(edital: Edital | null, settings: DossierDeliverySettings): boolean {
  if (!edital) return false;
  if (edital.urgencyLevel === "CRITICAL") return true;
  if (edital.urgencyLevel === "POS_48H") return true;
  const ageHours = (Date.now() - edital.createdAt.getTime()) / 3_600_000;
  return ageHours >= (settings.gateBTimeoutHours ?? 72);
}

interface BlocoReport {
  blocoA: Record<string, unknown>;
  blocoB: Record<string, unknown>;
  blocoC: Record<string, unknown>;
  blocoD: Record<string, unknown>;
}

function getS3(): S3Client {
  const endpoint = process.env["MINIO_ENDPOINT"] ?? "";
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

async function htmlToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

async function writeAudit(
  workspaceId: string,
  action: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): Promise<void> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!agent) return;
  await db.agentAuditLog.create({
    data: {
      workspaceId,
      agentId: agent.id,
      action,
      input: input as Record<string, string | number | boolean>,
      output: output as Record<string, string | number | boolean>,
      modelUsed: "groq",
      tokensUsed: 0,
      costUsd: 0,
      durationMs: 0,
      success: true,
    },
  });
}

function buildFieldSummary(evidences: { type: string; description: string | null }[]): string {
  return evidences
    .map((e) => `- ${e.type}: ${e.description?.slice(0, 400) ?? "(sem descrição)"}`)
    .join("\n");
}

function buildDocSummary(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return (items as { id: string; status: string; extractedData?: unknown }[])
    .map((i) => `- ${i.id} [${i.status}]: ${JSON.stringify(i.extractedData ?? {}).slice(0, 500)}`)
    .join("\n");
}

const CONSOLIDATION_PROMPT = `Você é especialista em análise de imóveis para arremate judicial.
Gere um relatório de viabilidade em JSON com os blocos abaixo. Seja objetivo.
Responda APENAS JSON válido, sem markdown.

{
  "blocoA": {
    "localizacao": "string",
    "estadoConservacao": "OTIMO|BOM|REGULAR|RUIM|PESSIMO",
    "acesso": "string",
    "vizinhanca": "string",
    "observacoesCampo": "string"
  },
  "blocoB": {
    "situacaoMatricula": "string",
    "onusIdentificados": ["string"],
    "debitosEstimados": 0,
    "pendenciasJuridicas": ["string"],
    "documentacaoCompleta": true
  },
  "blocoC": {
    "scoreRisco": 0,
    "justificativaScore": "string",
    "irregularidadesDetectadas": ["string"],
    "alertasCriticos": ["string"]
  },
  "blocoD": {
    "recomendacao": "RECOMENDAR|CAUTELA|NAO_RECOMENDAR",
    "pontoPositivos": ["string"],
    "pontosAtencao": ["string"],
    "sinteseExecutiva": "string",
    "proximosPassos": ["string"]
  }
}`;

function buildHtmlFromBlocos(
  blocos: BlocoReport,
  meta: Record<string, unknown>,
  footer: string | undefined,
): string {
  const d = blocos.blocoD as { recomendacao?: string; sinteseExecutiva?: string };
  const c = blocos.blocoC as { scoreRisco?: number; justificativaScore?: string };
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório consolidado</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:32px;color:#111}h1{color:#1e3a5f}h2{color:#2563eb;margin-top:24px}.box{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:12px 0}</style></head><body>
<h1>Relatório consolidado — viabilidade</h1>
<p><strong>Imóvel:</strong> ${String(meta["endereco"] ?? meta["imovelEndereco"] ?? "—")}</p>
<div class="box"><h2>Bloco A — Campo</h2><pre>${JSON.stringify(blocos.blocoA, null, 2)}</pre></div>
<div class="box"><h2>Bloco B — Documental</h2><pre>${JSON.stringify(blocos.blocoB, null, 2)}</pre></div>
<div class="box"><h2>Bloco C — Risco (${c.scoreRisco ?? "?"} / 10)</h2><p>${c.justificativaScore ?? ""}</p><pre>${JSON.stringify(blocos.blocoC, null, 2)}</pre></div>
<div class="box"><h2>Bloco D — Recomendação: ${d.recomendacao ?? ""}</h2><p>${(d.sinteseExecutiva ?? "").replace(/\n/g, "<br/>")}</p></div>
<footer style="margin-top:40px;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:8px">${footer ?? "FlowOS — documento interno."}</footer>
</body></html>`;
}

export async function consolidateDossier(
  dossierId: string,
  workspaceId: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const dossier = await db.propertyDossier.findFirst({
    where: { id: dossierId, workspaceId },
    include: {
      deal: { select: { id: true, meta: true, title: true } },
      checklist: true,
    },
  });
  if (!dossier) return { ok: false, error: "Dossiê não encontrado" };

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId },
    select: { settings: true },
  });
  if (!workspace) return { ok: false, error: "Workspace não encontrado" };
  const delivery = parseWorkspaceDossierSettings(workspace);

  const edital = await db.edital.findFirst({ where: { dealId: dossier.dealId, workspaceId } });

  const gateAOk =
    dossier.status === "FIELD_COMPLETE" ||
    dossier.status === "DOCS_PENDING" ||
    dossier.status === "READY" ||
    dossier.status === "GENERATED" ||
    dossier.status === "SHARED";

  const items = (dossier.checklist?.items ?? []) as unknown[];
  const gateBComplete = Boolean(dossier.checklist?.gateB);
  const bypass = shouldBypassGateB(edital, delivery);

  if (!opts?.force && !gateBComplete && !bypass) {
    return { ok: false, error: "Gate B incompleto — use force ou complete o checklist." };
  }
  if (!opts?.force && !gateAOk) {
    return { ok: false, error: "Gate A (vistoria) incompleto." };
  }

  const evidences = await db.fieldEvidence.findMany({
    where: { workspaceId, dealId: dossier.dealId },
    orderBy: { capturedAt: "asc" },
  });

  const meta = (dossier.deal.meta ?? {}) as Record<string, unknown>;
  const incomplete = !gateBComplete && bypass ? "\nDocumentação parcial (bypass Gate B)." : "";

  const fieldSummary = buildFieldSummary(evidences);
  const docSummary = buildDocSummary(items);
  const existingScore = Number(dossier.fieldScore ?? dossier.riskScore ?? 5);

  let blocos: BlocoReport;
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    blocos = {
      blocoA: { localizacao: String(meta["endereco"] ?? ""), estadoConservacao: "REGULAR", acesso: "", vizinhanca: "", observacoesCampo: fieldSummary.slice(0, 2000) },
      blocoB: { situacaoMatricula: "—", onusIdentificados: [], debitosEstimados: 0, pendenciasJuridicas: [], documentacaoCompleta: gateBComplete },
      blocoC: { scoreRisco: existingScore, justificativaScore: "Groq indisponível", irregularidadesDetectadas: [], alertasCriticos: [] },
      blocoD: { recomendacao: "CAUTELA", pontoPositivos: [], pontosAtencao: [], sinteseExecutiva: "Consolidação automática sem IA.", proximosPassos: ["Revisar documentos manualmente"] },
    };
  } else {
    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey });
    const user = `${CONSOLIDATION_PROMPT}\n${incomplete}\nEVIDÊNCIAS:\n${fieldSummary}\n\nDOCUMENTOS:\n${docSummary}\n\nSCORE PRELIMINAR: ${existingScore}/10`;
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Responda só JSON válido." },
        { role: "user", content: user.slice(0, 28_000) },
      ],
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    blocos = JSON.parse(raw) as BlocoReport;
  }

  const html = buildHtmlFromBlocos(blocos, meta, delivery.reportFooterText);
  let reportUrl: string | undefined;
  let reportKey: string | undefined;
  try {
    const pdf = await htmlToPdf(html);
    const bucket = process.env["MINIO_BUCKET"] ?? "flowos";
    const key = `${workspaceId}/dossiers/${dossierId}/relatorio-final.pdf`;
    await getS3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: pdf,
        ContentType: "application/pdf",
      }),
    );
    const publicBase = (process.env["MINIO_PUBLIC_URL"] ?? process.env["MINIO_ENDPOINT"] ?? "").replace(/\/+$/, "");
    reportUrl = `${publicBase}/${bucket}/${key}`;
    reportKey = key;
  } catch (e) {
    console.warn("[dossier-consolidator] PDF/upload falhou:", e);
  }

  const blocoD = blocos.blocoD as { recomendacao?: string };
  const blocoC = blocos.blocoC as { scoreRisco?: number };

  await db.propertyDossier.update({
    where: { id: dossierId, workspaceId },
    data: {
      status: "GENERATED",
      generatedAt: new Date(),
      fieldScore: Number(blocoC.scoreRisco ?? existingScore),
      riskScore: Number(blocoC.scoreRisco ?? existingScore),
      aiSummary: JSON.stringify(blocos),
      ...(reportUrl ? { reportUrl } : {}),
      ...(reportKey ? { reportKey } : {}),
    },
  });

  await writeAudit(workspaceId, "DOSSIER_CONSOLIDATED", { dossierId, dealId: dossier.dealId, force: Boolean(opts?.force) }, { hasPdf: Boolean(reportUrl) });

  return { ok: true };
}

export function createDossierConsolidator(connection: ConnectionOptions): Worker {
  return new Worker(
    DOSSIER_CONSOLIDATOR_QUEUE,
    async (job) => {
      const d = job.data as ConsolidateJobData;
      await consolidateDossier(d.dossierId, d.workspaceId, { force: Boolean(d.force) });
    },
    { connection, concurrency: 1 },
  );
}
