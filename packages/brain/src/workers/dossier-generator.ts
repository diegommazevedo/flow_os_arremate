/**
 * Dossier Generator — PARTE 5
 *
 * Gera relatório PDF consolidado do imóvel a partir de evidências
 * de campo e documentos cartoriais.
 *
 * Trigger: PropertyDossier.status → FIELD_COMPLETE
 *
 * [SEC-03] workspaceId em todas as queries.
 * [SEC-06] AuditLog: DOSSIER_GENERATED.
 * [P-01]  Regras do template ficam em packages/templates.
 * [P-02]  Dados do imóvel ficam em Deal.meta.
 */

import { db } from "@flow-os/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface DealMeta {
  imovelId?: string;
  chb?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  matricula?: string;
  modalidade?: string;
  valorArrematacao?: number;
  valorAvaliacao?: number;
  [key: string]: unknown;
}

interface EvidenceSummary {
  type: string;
  mediaUrl: string;
  mimeType: string;
  description: string | null;
}

interface DossierSection {
  title: string;
  content: string;
}

interface AiAnalysis {
  description: string;
  riskScore: number;
  riskFactors: string[];
  recommendation: "RECOMENDAR" | "CAUTELA" | "NAO_RECOMENDAR";
}

// ── Audit helper ───────────────────────────────────────────────────────────

async function writeAudit(
  workspaceId: string,
  action: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  success = true,
  error?: string,
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
      modelUsed: "none",
      tokensUsed: 0,
      costUsd: 0,
      durationMs: 0,
      success,
      ...(error ? { error } : {}),
    },
  });
}

// ── Roteamento dual AI: Ollama / Groq ─────────────────────────────────────

type AiProvider = "ollama" | "groq";

async function getAIProvider(): Promise<AiProvider> {
  const configured = (process.env["AI_PROVIDER"] ?? "groq").toLowerCase();
  if (configured === "groq") return "groq";
  if (configured === "ollama") return "ollama";
  if (configured === "auto") {
    try {
      const base = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
      const res = await fetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return "ollama";
    } catch {
      // Ollama offline — fallback para Groq
    }
    return "groq";
  }
  return "groq";
}

// ── Análise IA ────────────────────────────────────────────────────────────

const AI_ANALYSIS_PROMPT = `Você é um especialista em análise de imóveis para arrematação judicial no Brasil.
Com base nas evidências de campo coletadas por um vistoriador presencial, gere uma análise técnica objetiva.

Responda APENAS com JSON válido neste formato exato:
{
  "description": "<resumo objetivo em 3-5 linhas sobre estado e localização do imóvel>",
  "riskScore": <número de 0 a 10>,
  "riskFactors": [<lista de até 5 fatores de risco>],
  "recommendation": "<RECOMENDAR | CAUTELA | NAO_RECOMENDAR>"
}

Critérios de score:
- 0-3: Boa localização, acesso fácil, sem sinais de risco
- 4-6: Atenção necessária, verificar aspectos específicos
- 7-10: Alto risco — problemas sérios de acesso, segurança ou estrutura

Seja objetivo, técnico e baseado apenas nas evidências fornecidas.`;

/**
 * Transcreve áudio via Groq Whisper.
 * Faz download do áudio pelo mediaUrl, salva em tmp, e envia via fs stream.
 * (Node.js — não usa File API do browser)
 */
async function transcribeAudio(audioUrl: string): Promise<string> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return "[Transcrição indisponível — GROQ_API_KEY não configurada]";

  const { createReadStream } = await import("node:fs");
  const { writeFile, unlink } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const tmpPath = join(tmpdir(), `flowos-audio-${Date.now()}.ogg`);

  try {
    const response = await fetch(audioUrl);
    if (!response.ok) return "[Transcrição indisponível — download falhou]";

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    await writeFile(tmpPath, audioBuffer);

    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey });

    const transcription = await groq.audio.transcriptions.create({
      file: createReadStream(tmpPath),
      model: "whisper-large-v3",
      language: "pt",
      response_format: "text",
    });

    const text = typeof transcription === "string" ? transcription : transcription.text;
    return text || "[Áudio vazio]";
  } catch (err) {
    console.error("[dossier-generator] Transcrição falhou:", err);
    return "[Transcrição indisponível]";
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

/** Monta o prompt do usuário (compartilhado entre Ollama e Groq) */
function buildAnalysisPrompt(evidences: EvidenceSummary[], meta: DealMeta): string {
  const evidenceContext = evidences
    .map((e) => {
      const lines = [`Tipo: ${e.type}`];
      if (e.description) lines.push(`Descrição do agente: ${e.description}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const propertyContext = [
    `Endereço: ${meta.endereco ?? `${meta.cidade ?? ""}/${meta.uf ?? ""}`}`,
    meta.modalidade ? `Modalidade: ${meta.modalidade}` : "",
    meta.valorArrematacao ? `Valor arrematação: R$ ${Number(meta.valorArrematacao).toLocaleString("pt-BR")}` : "",
    meta.valorAvaliacao ? `Valor avaliação: R$ ${Number(meta.valorAvaliacao).toLocaleString("pt-BR")}` : "",
  ].filter(Boolean).join("\n");

  return [
    "DADOS DO IMÓVEL:",
    propertyContext,
    "",
    `EVIDÊNCIAS COLETADAS (${evidences.length} itens):`,
    evidenceContext,
  ].join("\n");
}

/** Parseia o JSON de resposta (compartilhado entre Ollama e Groq) */
function parseAiResponse(raw: string): AiAnalysis {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    description: typeof parsed["description"] === "string" ? parsed["description"] : "Análise não disponível.",
    riskScore: Math.min(10, Math.max(0, Number(parsed["riskScore"]) || 5)),
    riskFactors: Array.isArray(parsed["riskFactors"])
      ? (parsed["riskFactors"] as string[]).slice(0, 5)
      : [],
    recommendation: (["RECOMENDAR", "CAUTELA", "NAO_RECOMENDAR"] as const).includes(
      parsed["recommendation"] as "RECOMENDAR",
    )
      ? (parsed["recommendation"] as AiAnalysis["recommendation"])
      : "CAUTELA",
  };
}

async function analyzeViaOllama(userPrompt: string): Promise<AiAnalysis> {
  const base = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
  const model = process.env["OLLAMA_MODEL"] ?? "llama3.2";

  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: `${AI_ANALYSIS_PROMPT}\n\n${userPrompt}`,
      stream: false,
      format: "json",
    }),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { response: string };
  return parseAiResponse(data.response);
}

async function analyzeViaGroq(userPrompt: string): Promise<AiAnalysis> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada");

  const Groq = (await import("groq-sdk")).default;
  const groq = new Groq({ apiKey });

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: AI_ANALYSIS_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return parseAiResponse(raw);
}

async function analyzeEvidences(
  evidences: EvidenceSummary[],
  meta: DealMeta,
): Promise<AiAnalysis> {
  const provider = await getAIProvider();
  const userPrompt = buildAnalysisPrompt(evidences, meta);

  // Se nenhum provider utilizável → fallback estático
  if (provider === "groq" && !process.env["GROQ_API_KEY"]) {
    return analyzeEvidencesFallback(evidences, meta);
  }

  try {
    if (provider === "ollama") {
      return await analyzeViaOllama(userPrompt);
    }
    return await analyzeViaGroq(userPrompt);
  } catch (err) {
    console.error(`[dossier-generator] ${provider} analysis failed, using fallback:`, err);
    return analyzeEvidencesFallback(evidences, meta);
  }
}

/** Fallback quando Groq não está disponível */
function analyzeEvidencesFallback(
  evidences: EvidenceSummary[],
  meta: DealMeta,
): AiAnalysis {
  const photoCount = evidences.filter((e) => e.type.startsWith("PHOTO")).length;
  const videoCount = evidences.filter((e) => e.type.startsWith("VIDEO")).length;
  const audioCount = evidences.filter((e) => e.type === "AUDIO_DESCRIPTION").length;

  const hasGoodCoverage = photoCount >= 3 && videoCount >= 1;

  return {
    description: [
      `Imóvel localizado em ${meta.endereco ?? `${meta.cidade ?? ""}/${meta.uf ?? ""}`}.`,
      `Modalidade: ${meta.modalidade ?? "não informada"}.`,
      `Evidências coletadas: ${photoCount} fotos, ${videoCount} vídeos, ${audioCount} áudios.`,
      hasGoodCoverage
        ? "Cobertura visual adequada para análise preliminar."
        : "Cobertura visual parcial — recomendável vistoria complementar.",
    ].join(" "),
    riskScore: hasGoodCoverage ? 4.5 : 6.5,
    riskFactors: [
      ...(photoCount < 3 ? ["Poucas fotos externas para avaliação completa"] : []),
      ...(videoCount === 0 ? ["Sem vídeo da área — difícil avaliar entorno"] : []),
      ...(audioCount === 0 ? ["Sem relato de áudio do vistoriador"] : []),
      "Análise de ocupação pendente (verificação presencial necessária)",
      "Situação de débitos condominiais não verificada em campo",
    ].slice(0, 5),
    recommendation: "CAUTELA",
  };
}

// ── Gerador de HTML para PDF ──────────────────────────────────────────────

function buildDossierHtml(
  sections: DossierSection[],
  meta: DealMeta,
  analysis: AiAnalysis,
): string {
  const sectionHtml = sections
    .map(
      (s) => `
    <div class="section">
      <h2>${s.title}</h2>
      <div class="content">${s.content}</div>
    </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Dossiê do Imóvel — ${meta.imovelId ?? meta.chb ?? "N/A"}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #1a1a1a; }
    h1 { color: #1e3a5f; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; }
    h2 { color: #2563eb; margin-top: 30px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .score-box { background: #f0f9ff; border: 2px solid #2563eb; border-radius: 8px; padding: 15px; text-align: center; }
    .score { font-size: 36px; font-weight: bold; color: #2563eb; }
    .recommendation { font-size: 18px; font-weight: bold; padding: 8px 16px; border-radius: 4px; display: inline-block; margin-top: 10px; }
    .recommendation.RECOMENDAR { background: #dcfce7; color: #166534; }
    .recommendation.CAUTELA { background: #fef3c7; color: #92400e; }
    .recommendation.NAO_RECOMENDAR { background: #fee2e2; color: #991b1b; }
    .section { margin-bottom: 25px; }
    .content { line-height: 1.6; }
    .risk-factors { list-style: none; padding: 0; }
    .risk-factors li:before { content: "⚠ "; color: #f59e0b; }
    .evidence-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .evidence-item { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; text-align: center; font-size: 12px; }
    .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Dossiê do Imóvel</h1>
      <p><strong>ID:</strong> ${meta.imovelId ?? meta.chb ?? "N/A"} | <strong>Matrícula:</strong> ${meta.matricula ?? "N/A"}</p>
      <p><strong>Endereço:</strong> ${meta.endereco ?? `${meta.cidade ?? ""}/${meta.uf ?? ""}`}</p>
    </div>
    <div class="score-box">
      <div>Score de Risco</div>
      <div class="score">${analysis.riskScore.toFixed(1)}/10</div>
      <div class="recommendation ${analysis.recommendation}">${analysis.recommendation}</div>
    </div>
  </div>

  ${sectionHtml}

  <div class="footer">
    <p>Relatório gerado automaticamente pelo FlowOS — Arrematador Caixa | ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}</p>
    <p>Este documento é para uso interno e não substitui laudos técnicos profissionais.</p>
  </div>
</body>
</html>`;
}

// ── HTML → PDF via Playwright (lazy import) ───────────────────────────────

async function htmlToPdf(htmlContent: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

// ── Upload PDF para MinIO/S3 ──────────────────────────────────────────────

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

async function uploadPdfToMinio(
  pdfBuffer: Buffer,
  dossierId: string,
  workspaceId: string,
): Promise<{ url: string; key: string }> {
  const bucket = process.env["MINIO_BUCKET"] ?? "flowos";
  const key = `${workspaceId}/dossiers/${dossierId}/relatorio.pdf`;

  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
      Metadata: { workspaceId, dossierId },
    }),
  );

  const publicBase = (
    process.env["MINIO_PUBLIC_URL"] ?? process.env["MINIO_ENDPOINT"] ?? ""
  ).replace(/\/+$/, "");
  const url = `${publicBase}/${bucket}/${key}`;

  return { url, key };
}

// ── Gerador principal ─────────────────────────────────────────────────────

export async function generateDossier(
  dossierId: string,
  workspaceId: string,
): Promise<{ success: boolean; reportUrl?: string; error?: string }> {
  // 1. Buscar PropertyDossier com evidências e documentos [SEC-03]
  const dossier = await db.propertyDossier.findFirst({
    where: { id: dossierId, workspaceId },
    include: {
      deal: {
        select: { id: true, meta: true, title: true, contactId: true },
      },
      documents: true,
    },
  });

  if (!dossier) {
    return { success: false, error: "Dossiê não encontrado" };
  }

  const meta = (dossier.deal.meta ?? {}) as DealMeta;

  // Buscar evidências de campo do Deal
  const evidences = await db.fieldEvidence.findMany({
    where: { workspaceId, dealId: dossier.dealId },
    orderBy: { capturedAt: "asc" },
  });

  // 2. Transcrever áudios via Groq Whisper (atualiza description no banco)
  const audioEvidences = evidences.filter((e) => e.type === "AUDIO_DESCRIPTION" && !e.description);
  for (const audio of audioEvidences) {
    if (audio.mediaUrl) {
      const transcription = await transcribeAudio(audio.mediaUrl);
      await db.fieldEvidence.update({
        where: { id: audio.id },
        data: { description: transcription },
      });
      // Atualizar in-memory para uso nas seções seguintes
      (audio as { description: string | null }).description = transcription;
    }
  }

  const evidenceSummaries: EvidenceSummary[] = evidences.map((e) => ({
    type: e.type,
    mediaUrl: e.mediaUrl,
    mimeType: e.mimeType,
    description: e.description,
  }));

  // 3. Análise IA das evidências (Groq com fallback)
  const analysis = await analyzeEvidences(evidenceSummaries, meta);

  // 3. Montar seções do relatório
  const sections: DossierSection[] = [
    {
      title: "SEÇÃO 1 — Identificação do Imóvel",
      content: [
        `<p><strong>ID Imóvel:</strong> ${meta.imovelId ?? meta.chb ?? "N/A"}</p>`,
        `<p><strong>Matrícula:</strong> ${meta.matricula ?? "N/A"}</p>`,
        `<p><strong>Endereço:</strong> ${meta.endereco ?? `${meta.cidade ?? ""}/${meta.uf ?? ""}`}</p>`,
        `<p><strong>Modalidade:</strong> ${meta.modalidade ?? "N/A"}</p>`,
        meta.valorArrematacao ? `<p><strong>Valor Arrematação:</strong> R$ ${Number(meta.valorArrematacao).toLocaleString("pt-BR")}</p>` : "",
        meta.valorAvaliacao ? `<p><strong>Valor Avaliação:</strong> R$ ${Number(meta.valorAvaliacao).toLocaleString("pt-BR")}</p>` : "",
      ].filter(Boolean).join("\n"),
    },
    {
      title: "SEÇÃO 2 — Situação Documental",
      content: dossier.documents.length > 0
        ? `<ul>${dossier.documents.map((d) => `<li><strong>${d.type}:</strong> ${d.name}${d.issuedAt ? ` (emitido: ${new Date(d.issuedAt).toLocaleDateString("pt-BR")})` : ""}${d.expiresAt ? ` — validade: ${new Date(d.expiresAt).toLocaleDateString("pt-BR")}` : ""}</li>`).join("\n")}</ul>`
        : "<p>Nenhum documento cartorial anexado.</p>",
    },
    {
      title: "SEÇÃO 3 — Vistoria de Campo",
      content: [
        `<p>Total de evidências coletadas: <strong>${evidences.length}</strong></p>`,
        '<div class="evidence-grid">',
        ...evidences.map((e) =>
          `<div class="evidence-item"><strong>${e.type}</strong><br/>${e.description ?? "sem descrição"}</div>`,
        ),
        "</div>",
      ].join("\n"),
    },
    {
      title: "SEÇÃO 4 — Análise de Risco IA",
      content: [
        `<p>${analysis.description}</p>`,
        `<p><strong>Score de Risco:</strong> ${analysis.riskScore.toFixed(1)}/10</p>`,
        '<ul class="risk-factors">',
        ...analysis.riskFactors.map((f) => `<li>${f}</li>`),
        "</ul>",
      ].join("\n"),
    },
    {
      title: "SEÇÃO 5 — Resumo Executivo e Recomendação",
      content: [
        `<p><strong>Recomendação:</strong> <span class="recommendation ${analysis.recommendation}">${analysis.recommendation}</span></p>`,
        `<p>${analysis.description}</p>`,
        analysis.riskScore >= 7
          ? "<p><strong>ATENÇÃO:</strong> Score de risco elevado. Recomendamos vistoria presencial detalhada antes de prosseguir.</p>"
          : "",
      ].filter(Boolean).join("\n"),
    },
  ];

  // 4. Gerar HTML
  const html = buildDossierHtml(sections, meta, analysis);

  // 5. Converter HTML → PDF via Playwright (lazy import)
  let reportUrl: string | undefined;
  let reportKey: string | undefined;

  try {
    const pdfBuffer = await htmlToPdf(html);

    // 6. Upload para MinIO
    const uploaded = await uploadPdfToMinio(pdfBuffer, dossierId, workspaceId);
    reportUrl = uploaded.url;
    reportKey = uploaded.key;
  } catch (err) {
    console.error("[dossier-generator] PDF generation/upload failed:", err);
    // Continua sem PDF — dossiê ainda é útil sem o arquivo
  }

  // 7. Atualizar dossiê
  await db.propertyDossier.update({
    where: { id: dossierId, workspaceId },
    data: {
      status: "GENERATED",
      fieldScore: analysis.riskScore,
      riskScore: analysis.riskScore,
      aiSummary: analysis.description,
      generatedAt: new Date(),
      ...(reportUrl ? { reportUrl } : {}),
      ...(reportKey ? { reportKey } : {}),
    },
  });

  // 8. [SEC-06] AuditLog
  await writeAudit(workspaceId, "DOSSIER_GENERATED", {
    dossierId,
    dealId: dossier.dealId,
    evidenceCount: evidences.length,
    documentCount: dossier.documents.length,
  }, {
    fieldScore: analysis.riskScore,
    recommendation: analysis.recommendation,
    hasPdf: Boolean(reportUrl),
  });

  const result: { success: true; reportUrl?: string } = { success: true };
  if (reportUrl) result.reportUrl = reportUrl;
  return result;
}

export { AI_ANALYSIS_PROMPT, buildDossierHtml };
