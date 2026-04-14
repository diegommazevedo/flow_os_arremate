/**
 * Edital Processor — extrai dados estruturados de editais via Groq LLM.
 *
 * Fila: 'edital-processor'
 * [SEC-03] workspaceId. [SEC-06] AuditLog: EDITAL_PROCESSED.
 */

import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { db, Prisma } from "@flow-os/db";

export const EDITAL_PROCESSOR_QUEUE = "edital-processor";

interface EditalJobData {
  editalId: string;
  workspaceId: string;
}

const EXTRACTION_PROMPT = `Analise este edital de leilão judicial/extrajudicial.
Responda APENAS em JSON válido, sem markdown:
{
  "leilaoDate": "ISO 8601 com timezone Brasil ou null",
  "leilaoModalidade": "PRESENCIAL|ONLINE|VENDA_DIRETA ou null",
  "leiloeiro": "nome completo ou null",
  "varaJudicial": "vara e processo ou null",
  "valorAvaliacao": centavos_inteiro ou null,
  "lanceMinimo": centavos_inteiro ou null,
  "debitosEdital": [{"tipo":"IPTU|CONDOMINIO|HIPOTECA|OUTROS","valor":centavos,"descricao":"..."}],
  "restricoes": ["lista de restrições relevantes"],
  "prazoBoletoPago": "ISO 8601 prazo pagamento pós-arremate ou null",
  "endereco": "endereço completo ou null",
  "areaConstruida": metros_float ou null,
  "areaTerreno": metros_float ou null,
  "matricula": "número ou null",
  "numeroProcesso": "número do processo ou null"
}`;

// ── Processar Edital ──────────────────────────────────────────────────────

async function processEdital(data: EditalJobData): Promise<void> {
  const { editalId, workspaceId } = data;

  const edital = await db.edital.findFirst({
    where: { id: editalId, workspaceId },
    include: { deal: { select: { id: true, meta: true } } },
  });
  if (!edital) return;

  // Marcar como processando
  await db.edital.update({ where: { id: editalId }, data: { status: "PROCESSING" } });

  let rawText = edital.rawText ?? "";

  // Se tem fileUrl mas não rawText, extrair do PDF
  if (edital.fileUrl && !rawText) {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const response = await fetch(edital.fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const parsed = await pdfParse(buffer);
      rawText = parsed.text;
    } catch (err) {
      console.warn("[edital-processor] PDF parse falhou:", err);
      rawText = "";
    }
  }

  if (!rawText || rawText.length < 30) {
    await db.edital.update({ where: { id: editalId }, data: { status: "FAILED" } });
    return;
  }

  // Salvar rawText se veio do PDF
  if (!edital.rawText) {
    await db.edital.update({ where: { id: editalId }, data: { rawText } });
  }

  // Chamar Groq
  let parsed: Record<string, unknown> = {};
  try {
    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey: process.env["GROQ_API_KEY"] });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Você é um analista jurídico imobiliário. Responda APENAS em JSON válido, sem markdown." },
        { role: "user", content: `${EXTRACTION_PROMPT}\n\nEDITAL:\n${rawText.slice(0, 12000)}` },
      ],
      temperature: 0.1,
      max_tokens: 3000,
    });
    const content = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("[edital-processor] Groq falhou:", err);
    await db.edital.update({ where: { id: editalId }, data: { status: "FAILED" } });
    return;
  }

  // Calcular urgencyLevel
  const agora = new Date();
  let urgency: "CRITICAL" | "HIGH" | "NORMAL" | "EXPIRED" | "POS_48H" = "NORMAL";
  let deliveryContext: "PRE_ARREMATE" | "POS_ARREMATE" = "PRE_ARREMATE";
  let horasAteEvento: number | null = null;

  const leilaoDateStr = parsed["leilaoDate"] as string | null;
  let leilaoDate: Date | null = null;
  if (leilaoDateStr) {
    leilaoDate = new Date(leilaoDateStr);
    if (!isNaN(leilaoDate.getTime())) {
      const horas = (leilaoDate.getTime() - agora.getTime()) / 3_600_000;
      horasAteEvento = Math.round(horas);
      if (horas <= 0) {
        urgency = "EXPIRED";
        const dealMeta = (edital.deal.meta ?? {}) as Record<string, unknown>;
        if (dealMeta["arrematado"]) {
          urgency = "POS_48H";
          deliveryContext = "POS_ARREMATE";
        }
      } else if (horas <= 24) urgency = "CRITICAL";
      else if (horas <= 72) urgency = "HIGH";
    }
  }

  // Atualizar Edital
  const updateData: Prisma.EditalUpdateInput = {
    status: "DONE",
    leilaoDate: leilaoDate,
    leilaoModalidade: (parsed["leilaoModalidade"] as string) ?? null,
    leiloeiro: (parsed["leiloeiro"] as string) ?? null,
    varaJudicial: (parsed["varaJudicial"] as string) ?? null,
    valorAvaliacao: typeof parsed["valorAvaliacao"] === "number" ? (parsed["valorAvaliacao"] as number) : null,
    lanceMinimo: typeof parsed["lanceMinimo"] === "number" ? (parsed["lanceMinimo"] as number) : null,
    debitosEdital: Array.isArray(parsed["debitosEdital"]) ? (parsed["debitosEdital"] as Prisma.InputJsonValue) : Prisma.JsonNull,
    restricoes: Array.isArray(parsed["restricoes"]) ? (parsed["restricoes"] as Prisma.InputJsonValue) : Prisma.JsonNull,
    prazoBoletoPago: parsed["prazoBoletoPago"] ? new Date(parsed["prazoBoletoPago"] as string) : null,
    urgencyLevel: urgency,
    horasAteEvento,
    deliveryContext,
  };

  await db.edital.update({ where: { id: editalId }, data: updateData });

  // Atualizar Deal.meta com dados do edital (P-02)
  const dealMeta = (edital.deal.meta ?? {}) as Record<string, unknown>;
  const mergedMeta = {
    ...dealMeta,
    leilaoDate: leilaoDateStr,
    leilaoModalidade: parsed["leilaoModalidade"],
    valorAvaliacao: parsed["valorAvaliacao"],
    lanceMinimo: parsed["lanceMinimo"],
    urgencyLevel: urgency,
    endereco: parsed["endereco"] ?? dealMeta["endereco"],
    matricula: parsed["matricula"] ?? dealMeta["matricula"],
  };
  await db.deal.update({
    where: { id: edital.deal.id },
    data: { meta: mergedMeta as Prisma.InputJsonValue },
  });

  // AuditLog [SEC-06]
  const agent = await db.agent.findFirst({ where: { workspaceId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (agent) {
    await db.agentAuditLog.create({
      data: {
        workspaceId, agentId: agent.id,
        action: "EDITAL_PROCESSED",
        input: { editalId, dealId: edital.deal.id } as Record<string, string | number | boolean>,
        output: { urgency, horasAteEvento: horasAteEvento ?? -1, fieldsExtracted: Object.keys(parsed).length } as Record<string, string | number | boolean>,
        modelUsed: "llama-3.3-70b", tokensUsed: 0, costUsd: 0, durationMs: 0, success: true,
      },
    });
  }

  // Se CRITICAL: notificar equipe
  if (urgency === "CRITICAL") {
    console.warn(`[edital-processor] ⚡ CRITICAL: leilão em ${horasAteEvento}h — deal ${edital.deal.id}`);
    // Futuro: WA notification via Evolution API
  }
}

// ── Queue + Worker ───────────────────────────────────────────────────────

export async function enqueueEditalProcessing(
  data: EditalJobData,
  connection: ConnectionOptions,
): Promise<void> {
  const q = new Queue(EDITAL_PROCESSOR_QUEUE, { connection });
  await q.add("process", data, { removeOnComplete: true, removeOnFail: 50 });
  await q.close();
}

export function createEditalProcessor(connection: ConnectionOptions): Worker {
  return new Worker(
    EDITAL_PROCESSOR_QUEUE,
    async (job) => { await processEdital(job.data as EditalJobData); },
    { connection, concurrency: 2 },
  );
}
