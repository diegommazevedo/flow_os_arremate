/**
 * Dossier Document Processor — Gate B
 *
 * Processa certidões/documentos via Groq LLM.
 * Extrai campos estruturados e atualiza DossierChecklist.
 *
 * Fila: 'dossier-doc-processor'
 * [SEC-03] workspaceId em todas as queries.
 * [SEC-06] AuditLog: DOSSIER_DOC_PROCESSED.
 */

import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { enqueueDossierConsolidation } from "./dossier-consolidator";

export const DOSSIER_DOC_QUEUE = "dossier-doc-processor";

/** Brain roda fora do processo Next — notificar sse-bus via HTTP interno. */
async function forwardGateBUpdate(payload: {
  workspaceId: string;
  dealId: string;
  dossierId: string;
  itemId: string;
  gateB: boolean;
  itemStatus?: "done" | "error";
}): Promise<void> {
  const secret = process.env["FLOWOS_WORKER_SSE_SECRET"];
  const base =
    process.env["FLOWOS_PUBLIC_WEB_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "http://127.0.0.1:3030";
  if (!secret) return;
  const url = `${String(base).replace(/\/+$/, "")}/api/internal/worker-sse`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-flowos-worker-secret": secret,
      },
      body: JSON.stringify({
        type: "GATE_B_UPDATE",
        dealId: payload.dealId,
        patch: {
          workspaceId: payload.workspaceId,
          dossierId: payload.dossierId,
          itemId: payload.itemId,
          gateB: payload.gateB,
          ...(payload.itemStatus ? { itemStatus: payload.itemStatus } : {}),
        },
        timestamp: Date.now(),
      }),
    });
  } catch (err) {
    console.warn("[dossier-doc-processor] forward GATE_B_UPDATE falhou:", err);
  }
}

interface DocJobData {
  dossierId: string;
  itemId: string;
  fileUrl: string;
  workspaceId: string;
}

// ── Prompts por tipo de documento ─────────────────────────────────────────

const DOC_PROMPTS: Record<string, string> = {
  matricula: `Extraia APENAS em JSON:
{ "matricula": "string", "proprietarioAtual": "string",
  "endereco": "string", "areaConstruida": null,
  "areaTerreno": null, "transacoes": [{"data":"","tipo":"","valor":0}],
  "onusGravames": [] }`,

  onus_reais: `Extraia APENAS em JSON:
{ "hipoteca": {"existe":false,"valor":null},
  "penhora": {"existe":false,"processo":null},
  "alienacaoFiduciaria": false,
  "outrosOnus": [] }`,

  certidao_acoes: `Extraia APENAS em JSON:
{ "acoesAndamento": [{"tipo":"","vara":"","valor":0,"fase":""}],
  "execucoesFiscais": false,
  "falencia": false }`,

  debitos_municipais: `Extraia APENAS em JSON:
{ "iptuEmDia": false, "valorDebito": 0,
  "taxaLixo": false, "outrosDebitos": [] }`,

  situacao_condominio: `Extraia APENAS em JSON:
{ "debitoCondominio": null,
  "acaoCondominio": false,
  "taxaMensal": null }`,
};

// ── Processar documento ──────────────────────────────────────────────────

async function processDoc(data: DocJobData): Promise<void> {
  const { dossierId, itemId, fileUrl, workspaceId } = data;

  // 1. Buscar checklist
  const checklist = await db.dossierChecklist.findFirst({
    where: { dossierId, workspaceId },
  });
  if (!checklist) return;

  const dossierRow = await db.propertyDossier.findFirst({
    where: { id: dossierId, workspaceId },
    select: { dealId: true },
  });
  if (!dossierRow) return;

  const items = checklist.items as Array<{
    id: string; label: string; required: boolean;
    status: string; fileUrl?: string; extractedData?: unknown; doneBy?: string;
  }>;

  const itemIdx = items.findIndex(i => i.id === itemId);
  if (itemIdx === -1) return;

  try {
    // 2. Extrair texto do PDF
    let rawText = "";
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const parsed = await pdfParse(buffer);
      rawText = parsed.text;
    } catch {
      rawText = "[PDF não legível — OCR necessário]";
    }

    if (!rawText || rawText.length < 20) {
      rawText = "[Conteúdo insuficiente para extração]";
    }

    // 3. Enviar para Groq
    const prompt = DOC_PROMPTS[itemId] ?? `Extraia os dados relevantes deste documento em JSON.`;
    let extractedData: unknown = null;

    try {
      const Groq = (await import("groq-sdk")).default;
      const groq = new Groq({ apiKey: process.env["GROQ_API_KEY"] });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Você é um analista jurídico. Responda APENAS em JSON válido, sem markdown." },
          { role: "user", content: `${prompt}\n\nDOCUMENTO:\n${rawText.slice(0, 8000)}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content ?? "";
      // Extrair JSON do response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.warn("[dossier-doc-processor] Groq falhou:", err);
      extractedData = { error: "Extração falhou", raw: rawText.slice(0, 500) };
    }

    // 4. Atualizar item no checklist
    const prev = items[itemIdx]!;
    items[itemIdx] = {
      ...prev,
      status: "done",
      doneBy: "ai",
      extractedData,
    };

    // 5. Verificar Gate B
    const gateB = items.filter(i => i.required).every(i => i.status === "done");

    await db.dossierChecklist.update({
      where: { id: checklist.id },
      data: {
        items: items as unknown as Prisma.InputJsonValue,
        gateB,
        completedAt: gateB ? new Date() : null,
      },
    });

    await forwardGateBUpdate({
      workspaceId,
      dealId: dossierRow.dealId,
      dossierId,
      itemId,
      gateB,
      itemStatus: "done",
    });

    // 6. AuditLog
    const agent = await db.agent.findFirst({ where: { workspaceId }, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (agent) {
      await db.agentAuditLog.create({
        data: {
          workspaceId,
          agentId: agent.id,
          action: "DOSSIER_DOC_PROCESSED",
          input: { dossierId, itemId, fileUrl: fileUrl.slice(-40) } as Record<string, string | number | boolean>,
          output: { gateB, extractedFields: Object.keys(extractedData ?? {}).length } as Record<string, string | number | boolean>,
          modelUsed: "llama-3.3-70b",
          tokensUsed: 0,
          costUsd: 0,
          durationMs: 0,
          success: true,
        },
      });
    }

    // 7. Gate B completo + vistoria concluída (≥1 assignment COMPLETED) → consolidação
    if (gateB) {
      const dossier = await db.propertyDossier.findFirst({
        where: { id: dossierId, workspaceId },
        select: { status: true, dealId: true },
      });
      const completedVisit = await db.fieldAssignment.findFirst({
        where: { workspaceId, dealId: dossier?.dealId ?? "", status: "COMPLETED" },
        select: { id: true },
      });
      if (
        dossier &&
        completedVisit &&
        ["FIELD_COMPLETE", "DOCS_PENDING", "READY"].includes(dossier.status)
      ) {
        try {
          await enqueueDossierConsolidation(
            { dossierId, workspaceId },
            { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" },
          );
        } catch {
          /* Redis indisponível */
        }
      }
    }
  } catch (err) {
    // Marcar item como falho
    const prevErr = items[itemIdx]!;
    items[itemIdx] = { ...prevErr, status: "error", doneBy: "ai" };
    await db.dossierChecklist.update({
      where: { id: checklist.id },
      data: { items: items as unknown as Prisma.InputJsonValue },
    });
    const gateBNow = items.filter((i) => i.required).every((i) => i.status === "done");
    await forwardGateBUpdate({
      workspaceId,
      dealId: dossierRow.dealId,
      dossierId,
      itemId,
      gateB: gateBNow,
      itemStatus: "error",
    });
    console.error("[dossier-doc-processor] Erro:", err);
  }
}

// ── Enfileirar ───────────────────────────────────────────────────────────

export async function enqueueDossierDoc(
  data: DocJobData,
  connection: ConnectionOptions,
): Promise<void> {
  const q = new Queue(DOSSIER_DOC_QUEUE, { connection });
  await q.add("process", data, { removeOnComplete: true, removeOnFail: 50 });
  await q.close();
}

// ── Worker ───────────────────────────────────────────────────────────────

export function createDossierDocProcessor(connection: ConnectionOptions): Worker {
  return new Worker(
    DOSSIER_DOC_QUEUE,
    async (job) => { await processDoc(job.data as DocJobData); },
    { connection, concurrency: 3 },
  );
}
