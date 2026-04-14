/**
 * Edital Hunter — caçador automático de editais via RPA.
 *
 * Tenta fontes em paralelo: Caixa, portais de leiloeiros, DOU/TJs.
 * Fila: 'edital-hunter'
 * [SEC-03] workspaceId. [SEC-06] AuditLog: EDITAL_HUNT_*.
 */

import { Worker, type ConnectionOptions } from "bullmq";
import { db } from "@flow-os/db";
import type { EditalSource, Prisma } from "@flow-os/db";
import { enqueueEditalProcessing } from "./edital-processor";
import { EDITAL_HUNTER_QUEUE, type HuntJobData } from "./edital-hunter-queue";

export { enqueueEditalHunt, EDITAL_HUNTER_QUEUE } from "./edital-hunter-queue";
export type { HuntJobData } from "./edital-hunter-queue";

interface HuntResult {
  sourceType: EditalSource;
  sourceUrl: string;
  fileUrl?: string;
  rawText?: string;
}

// ── Alvos ────────────────────────────────────────────────────────────────

async function huntCaixa(codigoImovel: string): Promise<HuntResult | null> {
  try {
    // Playwright headless — buscar no portal Caixa
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const url = `https://venda.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=${encodeURIComponent(codigoImovel)}`;
    await page.goto(url, { timeout: 30000 });

    // Tentar encontrar link do edital
    const editalLink = await page.$('a[href*="edital"], a:has-text("Edital")');
    let fileUrl: string | undefined;
    let rawText: string | undefined;

    if (editalLink) {
      const href = await editalLink.getAttribute("href");
      if (href) {
        fileUrl = href.startsWith("http") ? href : `https://venda.caixa.gov.br${href}`;
      }
    }

    // Extrair dados da página como fallback
    if (!fileUrl) {
      const body = await page.textContent("body");
      rawText = body?.slice(0, 15000) ?? undefined;
    }

    await browser.close();

    if (fileUrl || rawText) {
      const out: HuntResult = { sourceType: "RPA_CAIXA", sourceUrl: url };
      if (fileUrl) out.fileUrl = fileUrl;
      if (rawText) out.rawText = rawText;
      return out;
    }
    return null;
  } catch (err) {
    console.warn("[edital-hunter] huntCaixa falhou:", err);
    return null;
  }
}

async function huntLeiloeiro(
  leiloeiro: string,
  endereco: string,
): Promise<HuntResult | null> {
  // Portais de leiloeiros — busca simplificada
  const portals: Array<{ nome: string; url: string }> = [
    { nome: "Sold", url: "https://sold.com.br" },
    { nome: "LanceCerto", url: "https://lancecerto.com.br" },
    { nome: "Zuk", url: "https://zuk.com.br" },
  ];

  const portal = portals.find(p =>
    leiloeiro.toLowerCase().includes(p.nome.toLowerCase()),
  );
  if (!portal) return null;

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Buscar por endereço no portal
    await page.goto(portal.url, { timeout: 20000 });
    const searchInput = await page.$('input[type="search"], input[name="q"], input[placeholder*="uscar"]');
    if (searchInput) {
      await searchInput.fill(endereco.slice(0, 50));
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);

      // Tentar encontrar link do edital na página de resultados
      const editalLink = await page.$('a[href*="edital"], a:has-text("Edital"), a:has-text("PDF")');
      if (editalLink) {
        const href = await editalLink.getAttribute("href");
        if (href) {
          await browser.close();
          return {
            sourceType: "RPA_LEILOEIRO",
            sourceUrl: portal.url,
            fileUrl: href.startsWith("http") ? href : `${portal.url}${href}`,
          };
        }
      }

      // Fallback: extrair texto da página
      const body = await page.textContent("body");
      await browser.close();
      if (body && body.length > 200) {
        return { sourceType: "RPA_LEILOEIRO", sourceUrl: portal.url, rawText: body.slice(0, 15000) };
      }
    }

    await browser.close();
    return null;
  } catch (err) {
    console.warn("[edital-hunter] huntLeiloeiro falhou:", err);
    return null;
  }
}

async function huntPublicacao(
  numeroProcesso: string,
  _uf: string,
): Promise<HuntResult | null> {
  try {
    // DOU — busca simplificada
    const searchUrl = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(numeroProcesso)}`;
    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;

    const html = await response.text();
    if (html.includes(numeroProcesso)) {
      return { sourceType: "RPA_DOU", sourceUrl: searchUrl, rawText: html.slice(0, 15000) };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Orquestrador ─────────────────────────────────────────────────────────

async function huntEdital(data: HuntJobData): Promise<void> {
  const { dealId, workspaceId } = data;

  const deal = await db.deal.findFirst({
    where: { id: dealId, workspaceId },
    select: { id: true, meta: true, workspaceId: true },
  });
  if (!deal) return;

  const meta = (deal.meta ?? {}) as Record<string, unknown>;
  const codigoImovel = meta["codigoImovelCaixa"] as string | undefined;
  const leiloeiro = meta["leiloeiro"] as string | undefined;
  const endereco = (meta["imovelEndereco"] ?? meta["endereco"] ?? "") as string;
  const numeroProcesso = meta["numeroProcesso"] as string | undefined;
  const uf = (meta["imovelUF"] ?? meta["uf"] ?? "") as string;

  // Tentar todos os alvos em paralelo
  const results = await Promise.allSettled([
    codigoImovel ? huntCaixa(codigoImovel) : Promise.resolve(null),
    leiloeiro && endereco ? huntLeiloeiro(leiloeiro, endereco) : Promise.resolve(null),
    numeroProcesso && uf ? huntPublicacao(numeroProcesso, uf) : Promise.resolve(null),
  ]);

  const found = results
    .filter((r): r is PromiseFulfilledResult<HuntResult | null> => r.status === "fulfilled")
    .map(r => r.value)
    .find(v => v !== null);

  // AuditLog
  const agent = await db.agent.findFirst({ where: { workspaceId }, select: { id: true }, orderBy: { createdAt: "asc" } });

  if (found) {
    // Criar ou atualizar Edital
    const edital = await db.edital.upsert({
      where: { dealId },
      create: {
        workspaceId,
        dealId,
        sourceType: found.sourceType,
        sourceUrl: found.sourceUrl,
        fileUrl: found.fileUrl ?? null,
        rawText: found.rawText ?? null,
        status: "PENDING",
      },
      update: {
        sourceType: found.sourceType,
        sourceUrl: found.sourceUrl,
        fileUrl: found.fileUrl ?? null,
        rawText: found.rawText ?? null,
        status: "PENDING",
      },
    });

    if (agent) {
      await db.agentAuditLog.create({
        data: {
          workspaceId, agentId: agent.id,
          action: "EDITAL_HUNT_FOUND",
          input: { dealId, source: found.sourceType } as Record<string, string | number | boolean>,
          output: { editalId: edital.id, hasFile: !!found.fileUrl, hasText: !!found.rawText } as Record<string, string | number | boolean>,
          modelUsed: "none", tokensUsed: 0, costUsd: 0, durationMs: 0, success: true,
        },
      });
    }

    // Enfileirar processamento
    const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    await enqueueEditalProcessing({ editalId: edital.id, workspaceId }, { url: redisUrl });
  } else {
    // Criar edital pendente de upload manual
    await db.edital.upsert({
      where: { dealId },
      create: { workspaceId, dealId, sourceType: "UPLOAD", status: "PENDING" },
      update: {},
    });

    if (agent) {
      await db.agentAuditLog.create({
        data: {
          workspaceId, agentId: agent.id,
          action: "EDITAL_HUNT_NOT_FOUND",
          input: { dealId, triedSources: 3 } as Record<string, string | number | boolean>,
          output: { needsManualUpload: true } as Record<string, string | number | boolean>,
          modelUsed: "none", tokensUsed: 0, costUsd: 0, durationMs: 0, success: true,
        },
      });
    }
  }
}

// ── Worker (Playwright só aqui — processo Brain, não Next) ───────────────

export function createEditalHunterWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    EDITAL_HUNTER_QUEUE,
    async (job) => { await huntEdital(job.data as HuntJobData); },
    { connection, concurrency: 1 }, // 1 — Playwright pesado
  );
}
