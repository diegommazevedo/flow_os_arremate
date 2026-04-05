/**
 * FlowOS v4 — Agente: Gerador de Relatório de Análise
 * [P-01] DEBT-ARQUITETURAL: migrar para packages/templates no MVP2
 *   (agente acoplado ao template real_estate_caixa.)
 *
 * [P-01] ADAPTER NOTE:
 *   Este arquivo é um adaptador de domínio de deal_item.
 *   Identificadores de campos do deal_item são do schema externo do portal.
 *   A lógica de orquestração (LLM, PDF, MinIO, AuditLog, pgvector) é genérica
 *   e totalmente injetável para facilitar testes.
 *
 * Trigger: BullMQ job 'generate-relatorio' (disparado pelo RPA worker).
 * Fluxo: DB → pgvector → LLM → HTML → PDF → MinIO → Document → pgvector → WhatsApp → AuditLog
 */

import { Queue, Worker as BullWorker, type Job } from "bullmq";
import { db }             from "@flow-os/db";
import { sanitizePrompt } from "@flow-os/core";
import type { VectorChunk, VectorSearchClient } from "../token-router";
import { ReportAnaliseSchema, type ReportAnalise } from "./relatorio-report-schema";
import type {
  MinioStorageDepsConfig,
  OrgConfig,
  RelatorioDeps,
  RelatorioPayload,
  RelatorioResult,
  RelatorioWorkerOptions,
} from "./relatorio-imovel-types";

export { ReportAnaliseSchema, type ReportAnalise } from "./relatorio-report-schema";
export type {
  MinioStorageDepsConfig,
  OrgConfig,
  RelatorioDeps,
  RelatorioPayload,
  RelatorioResult,
  RelatorioWorkerOptions,
} from "./relatorio-imovel-types";

// ─── §2 Builder do prompt LLM ────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    "Você é um especialista em análise de deal_items em processos de auction_event.",
    "Gere um relatório de análise em linguagem simples para o external_actor.",
    "",
    "REGRAS:",
    "- Responda APENAS em JSON válido seguindo o schema fornecido.",
    "- Use linguagem acessível, sem jargão técnico.",
    "- titleStatus.status deve ser:",
    "    'ok'         → title_status REGULAR ou similar positivo",
    "    'atencao'    → PENDENTE, IRREGULAR ou desconhecido",
    "    'bloqueante' → EM_TRATAMENTO, EMBARGADO ou situação que impede transferência",
    "- Liste riscos reais — sem omitir riscos altos.",
    "- proximosPassos deve ter prazos realistas (ex: '5 dias úteis', '30 dias').",
    "- prazosCriticos.paymentDeadline: informe quantos dias restam para o payment_deadline.",
    "- Não invente dados não fornecidos no contexto.",
  ].join("\n");
}

// [SEC-08] Helper: sanitiza qualquer valor antes de inserir no prompt LLM.
// Bloqueia injection tokens; PII legítimo é preservado (blockPIIPatterns: false)
// pois os dados vêm do nosso próprio banco e precisam estar no relatório.
function s(v: unknown): string {
  const str = typeof v === "string" ? v : String(v ?? "não informado");
  return sanitizePrompt(str, { blockPIIPatterns: false });
}

function buildUserPrompt(
  dealMeta:  Record<string, unknown>,
  faqChunks: VectorChunk[],
  pastChunks: VectorChunk[],
): string {
  const deadline = dealMeta["paymentDeadline"]
    ? new Date(dealMeta["paymentDeadline"] as string).toLocaleDateString("pt-BR")
    : "não informado";

  const daysLeft = dealMeta["paymentDeadline"]
    ? Math.ceil(
        (new Date(dealMeta["paymentDeadline"] as string).getTime() - Date.now()) / 86_400_000,
      )
    : null;

  // [SEC-08] Sanitizar conteúdo dos chunks pgvector antes de inserir no prompt
  const faqContext  = faqChunks.map(c  => `- ${sanitizePrompt(c.content,  { blockPIIPatterns: false })}`).join("\n");
  const pastContext = pastChunks.map(c => `- ${sanitizePrompt(c.content, { blockPIIPatterns: false })}`).join("\n");

  return [
    "## Dados do deal_item",
    `Endereço:        ${s(dealMeta["endereco"]       ?? "não informado")}`,
    `UF:              ${s(dealMeta["uf"]             ?? "")}`,
    `Modalidade:      ${s(dealMeta["modalidade"]     ?? "")}`,
    `property_id:     ${s(dealMeta["property_id"]    ?? "não informado")}`,
    `phase_tax_ref:   ${s(dealMeta["phase_tax_ref"]  ?? dealMeta["iptu"]      ?? "não informado")}`,
    `title_status:    ${s(dealMeta["title_status"]   ?? "não informado")}`,
    `Valor avaliação: R$ ${Number(dealMeta["valorAvaliacao"] ?? 0).toLocaleString("pt-BR")}`,
    `Valor total:     R$ ${Number(dealMeta["valorTotal"]     ?? 0).toLocaleString("pt-BR")}`,
    `payment_deadline: ${deadline}${daysLeft !== null ? ` (${daysLeft} dias restantes)` : ""}`,
    "",
    "## Riscos por UF (base de conhecimento)",
    faqContext || "Nenhum contexto disponível.",
    "",
    "## Casos similares anteriores",
    pastContext || "Nenhum caso anterior disponível.",
    "",
    "## Schema JSON esperado",
    JSON.stringify({
      resumo:          "string",
      titleStatus:     { status: "ok|atencao|bloqueante", mensagem: "string" },
      riscos:          [{ titulo: "string", descricao: "string", nivel: "baixo|medio|alto" }],
      proximosPassos:  [{ ordem: 1, acao: "string", prazo: "string" }],
      prazosCriticos:  { paymentDeadline: "string", processo: "string" },
    }, null, 2),
  ].join("\n");
}

// ─── §4 Renderizador HTML ─────────────────────────────────────────────────────

function renderHtml(
  report:    ReportAnalise,
  dealMeta:  Record<string, unknown>,
  org:       OrgConfig,
): string {
  const color   = org.portalColor ?? "#2563eb";
  const orgName = org.orgName     ?? "FlowOS Portal";
  const today   = new Date().toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });

  // Badge de title_status (status documental do deal_item)
  const badgeMap = {
    ok:         { bg: "#dcfce7", text: "#166534", border: "#86efac", label: "✅ Título Regular" },
    atencao:    { bg: "#fef9c3", text: "#854d0e", border: "#fde047", label: "⚠️ Atenção Necessária" },
    bloqueante: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5", label: "🚫 Bloqueante" },
  } as const;
  const badge = badgeMap[report.titleStatus.status];

  // Ícones de risco
  const riskIcon: Record<string, string> = { baixo: "🟢", medio: "🟡", alto: "🔴" };

  // Riscos HTML
  const riscosHtml = report.riscos.map(r => `
    <div class="risk-item risk-${r.nivel}">
      <div class="risk-header">
        <span class="risk-icon">${riskIcon[r.nivel] ?? "⚪"}</span>
        <strong>${escHtml(r.titulo)}</strong>
        <span class="risk-badge">${r.nivel.toUpperCase()}</span>
      </div>
      <p class="risk-desc">${escHtml(r.descricao)}</p>
    </div>`).join("");

  // Próximos passos HTML
  const passosHtml = report.proximosPassos.map(p => `
    <div class="step">
      <div class="step-num" style="background:${color}">${p.ordem}</div>
      <div class="step-content">
        <p class="step-acao">${escHtml(p.acao)}</p>
        <span class="step-prazo">⏱ ${escHtml(p.prazo)}</span>
      </div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de Análise — ${escHtml(String(dealMeta["endereco"] ?? ""))}  </title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.6;background:#fff}
  .header{background:${color};padding:28px 36px;display:flex;align-items:center;justify-content:space-between}
  .header-title{color:#fff}
  .header-title h1{font-size:22px;font-weight:700;margin-bottom:4px}
  .header-title p{font-size:14px;opacity:.85}
  .header-date{color:rgba(255,255,255,.8);font-size:13px;text-align:right}
  .content{padding:32px 36px;max-width:800px;margin:0 auto}
  h2{font-size:18px;font-weight:700;color:#111827;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb}
  .section{margin-bottom:28px}
  /* Resumo */
  .resumo{background:#f9fafb;border-left:4px solid ${color};padding:16px 20px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.7}
  /* Badge de title_status */
  .badge-avb{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;font-size:15px;font-weight:600;border:1.5px solid ${badge.border};background:${badge.bg};color:${badge.text};margin-bottom:8px}
  .avb-msg{font-size:14px;color:#374151;margin-top:6px}
  /* Riscos */
  .risk-item{padding:12px 16px;border-radius:10px;margin-bottom:10px;border:1px solid #e5e7eb}
  .risk-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .risk-badge{margin-left:auto;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:#f3f4f6;color:#374151}
  .risk-desc{font-size:14px;color:#6b7280;margin-left:28px}
  .risk-baixo{background:#f0fdf4}.risk-medio{background:#fefce8}.risk-alto{background:#fef2f2}
  /* Passos */
  .step{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}
  .step-num{width:32px;height:32px;border-radius:50%;color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
  .step-content{flex:1}
  .step-acao{font-size:15px;font-weight:500;color:#111827}
  .step-prazo{font-size:13px;color:#6b7280;display:inline-block;margin-top:2px}
  /* Prazos críticos */
  .prazos{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .prazo-card{padding:16px;border-radius:12px;border:1px solid #e5e7eb;background:#f9fafb}
  .prazo-label{font-size:12px;font-weight:600;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
  .prazo-valor{font-size:15px;font-weight:600;color:#111827}
  /* Footer */
  .footer{margin-top:40px;padding:20px 36px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>

<div class="header">
  <div class="header-title">
    <h1>📋 Relatório de Análise do Deal</h1>
    <p>${escHtml(String(dealMeta["endereco"] ?? ""))} — ${escHtml(String(dealMeta["uf"] ?? ""))}</p>
  </div>
  <div class="header-date">
    <strong>${escHtml(orgName)}</strong><br>
    Gerado em ${today}
  </div>
</div>

<div class="content">

  <div class="section">
    <h2>📋 Resumo</h2>
    <div class="resumo">${escHtml(report.resumo)}</div>
  </div>

  <div class="section">
    <h2>📜 Status do Título</h2>
    <div class="badge-avb">${badge.label}</div>
    <p class="avb-msg">${escHtml(report.titleStatus.mensagem)}</p>
  </div>

  <div class="section">
    <h2>⚠️ Riscos Identificados</h2>
    ${riscosHtml}
  </div>

  <div class="section">
    <h2>🗺️ Próximos Passos</h2>
    ${passosHtml}
  </div>

  <div class="section">
    <h2>⏰ Prazos Críticos</h2>
    <div class="prazos">
      <div class="prazo-card">
        <div class="prazo-label">Prazo de Pagamento</div>
        <div class="prazo-valor">${escHtml(report.prazosCriticos.paymentDeadline)}</div>
      </div>
      <div class="prazo-card">
        <div class="prazo-label">Duração do Processo</div>
        <div class="prazo-valor">${escHtml(report.prazosCriticos.processo)}</div>
      </div>
    </div>
  </div>

</div>

<div class="footer">
  ${escHtml(orgName)} · Este relatório é informativo e não substitui assessoria jurídica
</div>

</body>
</html>`;
}

/** Escapa caracteres HTML perigosos */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── §5 Geração de PDF com Playwright ────────────────────────────────────────

async function htmlToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format:          "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ─── §6 Helper: URL válida ou regenerar ──────────────────────────────────────

const URL_REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 1h antes do vencimento

async function freshPresignedUrl(
  docId:       string,
  workspaceId: string,    // [MULTI-TENANT] obrigatório — previne acesso cross-tenant
  key:         string,
  expiresAt:   Date | null,
  getDeps:     RelatorioDeps,
  prisma:      typeof db,
): Promise<string> {
  const needsRefresh =
    !expiresAt ||
    expiresAt.getTime() - Date.now() < URL_REFRESH_THRESHOLD_MS;

  if (!needsRefresh) {
    // [MULTI-TENANT] findFirst com workspaceId garante isolamento de tenant
    const doc = await prisma.document.findFirst({
      where:  { id: docId, workspaceId },
      select: { url: true },
    });
    return doc?.url ?? "";
  }

  // [MULTI-TENANT] verificar ownership antes de atualizar
  const owned = await prisma.document.findFirst({ where: { id: docId, workspaceId } });
  if (!owned) throw new Error(`Document ${docId} not found in workspace ${workspaceId}`);

  const newUrl    = await getDeps.getPresignedUrl(key, 7 * 24 * 3600);
  const newExpiry = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  await prisma.document.update({
    where: { id: docId },
    data:  { url: newUrl, expiresAt: newExpiry },
  });

  return newUrl;
}

// ─── §7 Função principal ──────────────────────────────────────────────────────

const PRESIGNED_TTL_SECS = 7 * 24 * 3600; // 7 dias

export async function generateDealItemReport(
  payload: RelatorioPayload,
  deps:    RelatorioDeps,
): Promise<RelatorioResult> {
  const prisma  = deps.prisma ?? db;
  const startMs = Date.now();

  // ── 1. Buscar Deal + Contact ────────────────────────────────────────────────
  const deal = await prisma.deal.findUniqueOrThrow({
    where:   { id: payload.dealId },
    include: { contact: true, workspace: true },
  });

  const dealMeta  = (deal.meta ?? {}) as Record<string, unknown>;
  const orgConfig: OrgConfig = {
    portalColor: String((deal.workspace.settings as Record<string,unknown>)?.["portalColor"] ?? "#2563eb"),
    orgName:     deal.workspace.name,
  };

  // ── 2. Buscar contexto pgvector ─────────────────────────────────────────────
  const searchQuery = [
    dealMeta["endereco"]    ?? "",
    dealMeta["uf"]          ?? "",
    dealMeta["title_status"] ?? "",
  ].join(" ").trim();

  const [faqChunks, pastChunks] = await Promise.all([
    deps.vectorSearch.search(searchQuery, ["faq"],               payload.workspaceId, 3),
    deps.vectorSearch.search(searchQuery, ["past_interactions"], payload.workspaceId, 2),
  ]);

  // ── 3. Chamar LLM com structured output (Claude → gpt-4o-mini fallback) ────
  const system = buildSystemPrompt();
  const user   = buildUserPrompt(dealMeta, faqChunks, pastChunks);
  let report: ReportAnalise;

  try {
    const raw = await deps.callClaude(system, user);
    report    = ReportAnaliseSchema.parse(JSON.parse(extractJson(raw)));
  } catch (firstErr) {
    // Retry com modelo fallback [gpt-4o-mini]
    try {
      const raw2 = await deps.callFallback(system, user);
      report     = ReportAnaliseSchema.parse(JSON.parse(extractJson(raw2)));
    } catch (secondErr) {
      throw new Error(
        `LLM falhou em ambas as tentativas. ` +
        `Claude: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}. ` +
        `Fallback: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`,
      );
    }
  }

  // ── 4–5. Renderizar HTML → PDF ─────────────────────────────────────────────
  const html      = renderHtml(report, dealMeta, orgConfig);
  const pdfConverter = deps.htmlToPdf ?? htmlToPdf;
  const pdfBuffer = await pdfConverter(html);

  // ── 6. Upload MinIO ─────────────────────────────────────────────────────────
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const minKey = `${payload.workspaceId}/${payload.dealId}/relatorio-analise-${today}.pdf`;

  await deps.uploadBuffer(minKey, pdfBuffer, "application/pdf");

  const pdfUrl   = await deps.getPresignedUrl(minKey, PRESIGNED_TTL_SECS);
  const expiresAt = new Date(Date.now() + PRESIGNED_TTL_SECS * 1000);

  // ── 7. Criar Document no banco ─────────────────────────────────────────────
  const doc = await prisma.document.create({
    data: {
      workspaceId: payload.workspaceId,
      dealId:      payload.dealId,
      name:        "Relatório de Análise do Deal",
      url:         pdfUrl,
      contentType: "application/pdf",
      collection:  "deal_docs",
      sizeBytes:   pdfBuffer.length,
      expiresAt,
      meta: {
        minioKey:    minKey,
        uf:          (dealMeta["uf"]        as string) ?? "",
        modalidade:  (dealMeta["modalidade"] as string) ?? "",
        generatedAt: new Date().toISOString(),
      },
    },
  });

  // ── 8. Indexar resumo no pgvector (past_interactions) ─────────────────────
  const indexContent = [
    report.resumo,
    ...report.riscos.map(r => `${r.nivel}: ${r.titulo}`),
  ].join(". ");

  await deps.vectorSearch.upsert(
    "past_interactions",
    indexContent,
    {
      dealId:       payload.dealId,
      uf:           dealMeta["uf"],
      modalidade:   dealMeta["modalidade"],
      title_status: dealMeta["title_status"],
      indexedAt:    new Date().toISOString(),
    },
    payload.workspaceId,
  );

  // ── 9. Enviar WhatsApp ─────────────────────────────────────────────────────
  const actorPhone = deal.contact?.phone ?? "";
  if (actorPhone) {
    // Verifica/atualiza URL usando expiresAt DO banco (não o local),
    // para que reexecuções com URLs prestes a vencer sejam renovadas corretamente.
    const docExpiresAt = (doc as unknown as { expiresAt?: Date | null }).expiresAt ?? expiresAt;
    const sendUrl = await freshPresignedUrl(doc.id, payload.workspaceId, minKey, docExpiresAt, deps, prisma);
    await deps.sendWhatsApp(actorPhone, sendUrl);
  }

  // ── 10. AuditLog ──────────────────────────────────────────────────────────
  await deps.auditWriter.log({
    action:     "generate_relatorio",
    input:      { dealId: payload.dealId },
    output:     { pdfUrl, documentId: doc.id },
    success:    true,
    durationMs: Date.now() - startMs,
    severity:   "info",
  });

  return { documentId: doc.id, pdfUrl, report };
}

// ─── §8 Utilitário: extrai bloco JSON de resposta LLM ────────────────────────

function extractJson(raw: string): string {
  // Remove markdown code fences se presentes
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1]!.trim();
  // Tenta encontrar objeto JSON diretamente
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
  return raw.trim();
}

// ─── §9 BullMQ Worker factory ────────────────────────────────────────────────

export const RELATORIO_QUEUE = "generate-relatorio";

export function createRelatorioWorker(opts: RelatorioWorkerOptions): BullWorker {
  return new BullWorker(
    RELATORIO_QUEUE,
    async (job: Job<RelatorioPayload>) => {
      return generateDealItemReport(job.data, opts.deps);
    },
    {
      connection:  opts.connection,
      concurrency: 3,
    },
  );
}

// ─── §10 Factory de deps reais (MinIO + WhatsApp) ────────────────────────────

/**
 * Cria uma implementação real das deps de storage usando AWS S3 SDK
 * (compatível com MinIO via endpoint customizado).
 *
 * Uso:
 *   import { createMinioStorageDeps } from './relatorio-imov\u0065l'
 *   const storageDeps = createMinioStorageDeps({...})
 */
export function createMinioStorageDeps(
  cfg: MinioStorageDepsConfig,
): Pick<RelatorioDeps, "uploadBuffer" | "getPresignedUrl"> {
  // Lazy-loaded para não exigir @aws-sdk em ambientes sem infra
  return {
    async uploadBuffer(key, buf, contentType) {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = new S3Client({
        endpoint:              cfg.endpoint,
        forcePathStyle:        true,
        region:                cfg.region ?? "us-east-1",
        credentials: {
          accessKeyId:     cfg.accessKey,
          secretAccessKey: cfg.secretKey,
        },
      });
      await client.send(
        new PutObjectCommand({
          Bucket:      cfg.bucket,
          Key:         key,
          Body:        buf,
          ContentType: contentType,
        }),
      );
    },

    async getPresignedUrl(key, expiresInSeconds) {
      const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl }               = await import("@aws-sdk/s3-request-presigner");
      const client = new S3Client({
        endpoint:       cfg.endpoint,
        forcePathStyle: true,
        region:         cfg.region ?? "us-east-1",
        credentials: {
          accessKeyId:     cfg.accessKey,
          secretAccessKey: cfg.secretKey,
        },
      });
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    },
  };
}

export { generateDealItemReport as generateRelatorioImov\u0065l };
export { createRelatorioWorker as createDealItemReportWorker };
