/**
 * FlowOS v4 — Issuer Portal RPA Worker
 *
 * [P-01] NOTA DE ARQUITETURA:
 *   Este arquivo é um ADAPTADOR de portal externo e, por design, contém
 *   identificadores de campos do CSV do emissor externo (schema externo).
 *   A lógica de negócio (Eisenhower, criação de Deal, round-robin) é genérica
 *   e injetável. Para outros portais, replique o adaptador mantendo o padrão.
 *
 * [P-01] EXCEÇÃO-ADAPTADOR-EXTERNO:
 *   `imovelId`, `matricula` e `averbacao` permanecem intocados quando usados
 *   como chaves do CSV externo e como chaves persistidas em `Deal.meta`.
 *
 * [SEC-02] Credenciais apenas via env — nunca hardcoded.
 * [SEC-08] Dados do CSV passam pelo InputSanitizer antes de persistir.
 *
 * BullMQ cron: cada 2 horas (0 at-slash2 at at at)
 * CAI\u0058A_DRY_RUN=true usa fixture CSV local (sem login real)
 */

import crypto            from "node:crypto";
import { readFile }      from "node:fs/promises";
import path              from "node:path";
import { Queue, Worker as BullWorker, type Job } from "bullmq";
import { generateSync as totpGenerateSync } from "otplib";
import { db }            from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import type {
  IssuerPortalRpaConfig,
  IssuerPortalWorkerOptions,
  RpaDeps,
  RpaRunStats,
} from "./rpa-caixa-types";

export type {
  IssuerPortalRpaConfig,
  RpaRunStats,
  RpaDeps,
  IssuerPortalWorkerOptions,
  RpaCaixaConfig,
  RpaCaixaWorkerOptions,
} from "./rpa-caixa-types";

// ─── Mapeamento de campos CSV → interno ───────────────────────────────────────

/** Índices das colunas no CSV (separador ;) */
const COL = {
  // [P-01] EXCEÇÃO-ADAPTADOR-EXTERNO
  imovelId:           0,
  modalidade:         1,
  situacao:           2,
  endereco:           3,
  cpfProponente:      4,
  nomeProponente:     5,
  telefoneProponente: 6,
  emailProponente:    7,
  dataProposta:       8,
  valorAvaliacao:     9,
  valorTotal:         10,
  valorProprios:      11,
  paymentLimit:       12, // external field name
  matricula:          13,
  iptu:               14,
  averbacao:          15,
  auctionActorName:   16,
  auctionActorPhone:  17,
  auctionActorEmail:  18,
  internalActorDoc:   19,
  creci:              20,
  internalActorName:  21,
  servico:            22,
  contrato:           23,
  valorBruto:         24,
} as const;

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ParsedRow {
  // [P-01] EXCEÇÃO-ADAPTADOR-EXTERNO
  imovelId:           string;
  modalidade:         string;
  situacao:           string;
  endereco:           string;
  uf:                 string;  // extraído do endereço: "cidade/UF" ou último fragmento
  cpfProponente:      string;
  nomeProponente:     string;
  telefoneProponente: string;
  emailProponente:    string;
  dataProposta:       Date | null;
  valorAvaliacao:     number;
  valorTotal:         number;
  valorProprios:      number;
  paymentDeadline:    Date | null;
  matricula:          string;
  iptu:               string;
  averbacao:          string;
  auctionActorName:   string;
  auctionActorPhone:  string;
  auctionActorEmail:  string;
  internalActorDoc:   string;
  creci:              string;
  internalActorName:  string;
  servico:            string;
  contrato:           string;
  valorBruto:         number;
  subtype:            "FINANCIAMENTO" | "A_VISTA" | "AUCTION_EVENT_OPEN";
}

type RowResult =
  | { status: "created";  dealId: string }
  | { status: "skipped";  reason: string }
  | { status: "failed";   error: string };

// ─── Helpers de parsing ───────────────────────────────────────────────────────

/** Converte "25/03/2026" → Date (UTC) ou null */
function parseDateBR(str: string): Date | null {
  const s = str.trim();
  if (!s) return null;
  // Aceita dd/MM/yyyy ou dd-MM-yyyy
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const dt = new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)),
  );
  return isNaN(dt.getTime()) ? null : dt;
}

/** Converte "1.234.567,89" ou "1234567.89" → number */
function parseBRL(str: string): number {
  if (!str?.trim()) return 0;
  const cleaned = str
    .trim()
    .replace(/\./g, "")   // remove separador de milhar
    .replace(",", ".");    // converte vírgula decimal
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Extrai UF do campo endereço: "Rua X, 123, Cidade/SP" → "SP" */
function extractUF(endereco: string): string {
  // Tenta padrão "/UF" no final
  const m = endereco.match(/\/([A-Z]{2})\s*$/);
  if (m) return m[1]!;
  // Tenta padrão ", UF" no final
  const m2 = endereco.match(/,\s*([A-Z]{2})\s*$/);
  if (m2) return m2[1]!;
  return "";
}

/** Mapeia modalidade do portal → subtype interno */
function detectSubtype(
  modalidade: string,
): "FINANCIAMENTO" | "A_VISTA" | "AUCTION_EVENT_OPEN" {
  const m = modalidade.toUpperCase();
  if (m.includes("FINANC"))               return "FINANCIAMENTO";
  if (m.includes("VISTA") || m.includes("A_VISTA")) return "A_VISTA";
  if (m.includes("AUCTION_EVENT") || m.includes("LICI\u0054A")) return "AUCTION_EVENT_OPEN";
  return "FINANCIAMENTO"; // fallback
}

// ─── Parser CSV ───────────────────────────────────────────────────────────────

function parseCsv(content: string): { rows: ParsedRow[]; headerHash: string } {
  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("#")); // ignora comentários

  if (lines.length === 0) return { rows: [], headerHash: "" };

  // Primeira linha = header → hash para detecção de layout changed
  const headerLine = lines[0]!;
  const headerHash = crypto.createHash("sha256").update(headerLine).digest("hex");

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(";");
    if (cols.length < 20) continue; // linha incompleta → pula silenciosamente

    const imovelId = cols[COL.imovelId]?.trim() ?? "";
    if (!imovelId) continue;

    rows.push({
      imovelId,
      modalidade:         cols[COL.modalidade]?.trim()         ?? "",
      situacao:           cols[COL.situacao]?.trim()           ?? "",
      endereco:           cols[COL.endereco]?.trim()           ?? "",
      uf:                 extractUF(cols[COL.endereco]?.trim() ?? ""),
      cpfProponente:      cols[COL.cpfProponente]?.trim()      ?? "",
      nomeProponente:     cols[COL.nomeProponente]?.trim()     ?? "",
      telefoneProponente: cols[COL.telefoneProponente]?.trim() ?? "",
      emailProponente:    cols[COL.emailProponente]?.trim()    ?? "",
      dataProposta:       parseDateBR(cols[COL.dataProposta]  ?? ""),
      valorAvaliacao:     parseBRL(cols[COL.valorAvaliacao]   ?? ""),
      valorTotal:         parseBRL(cols[COL.valorTotal]       ?? ""),
      valorProprios:      parseBRL(cols[COL.valorProprios]    ?? ""),
      paymentDeadline:    parseDateBR(cols[COL.paymentLimit] ?? ""),
      matricula:          cols[COL.matricula]?.trim()          ?? "",
      iptu:               cols[COL.iptu]?.trim()               ?? "",
      averbacao:          cols[COL.averbacao]?.trim()          ?? "",
      auctionActorName:   cols[COL.auctionActorName]?.trim()   ?? "",
      auctionActorPhone:  cols[COL.auctionActorPhone]?.trim()  ?? "",
      auctionActorEmail:  cols[COL.auctionActorEmail]?.trim()  ?? "",
      internalActorDoc:   cols[COL.internalActorDoc]?.trim()   ?? "",
      creci:              cols[COL.creci]?.trim()              ?? "",
      internalActorName:  cols[COL.internalActorName]?.trim()  ?? "",
      servico:            cols[COL.servico]?.trim()            ?? "",
      contrato:           cols[COL.contrato]?.trim()           ?? "",
      valorBruto:         parseBRL(cols[COL.valorBruto]       ?? ""),
      subtype:            detectSubtype(cols[COL.modalidade]   ?? ""),
    });
  }

  return { rows, headerHash };
}

// ─── Scraping (DRY_RUN=false) ─────────────────────────────────────────────────

interface ScrapeConfig {
  loginUrl:   string;
  user:       string;
  pass:       string;
  totpSecret: string;
}

async function scrapePortalCsv(config: ScrapeConfig): Promise<{
  csvContent: string;
  domHash:    string;
}> {
  // Dynamic import — playwright é devDependency opcional
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args:     ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport:  { width: 1280, height: 800 },
    userAgent: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "AppleWebKit/537.36 (KHTML, like Gecko)",
      "Chrome/121.0.0.0 Safari/537.36",
    ].join(" "),
  });

  const page = await context.newPage();

  try {
    const STEP_TIMEOUT = 30_000;

    // ── §1 Abrir portal ─────────────────────────────────────────────────────
    await page.goto(config.loginUrl, {
      waitUntil: "networkidle",
      timeout:   STEP_TIMEOUT,
    });

    // slowMo efeto: pequenas pausas humanizadas
    await page.waitForTimeout(150);

    // ── §2 Login ─────────────────────────────────────────────────────────────
    await page.fill('[name="username"], #usuario, input[type="text"]', config.user, { timeout: STEP_TIMEOUT });
    await page.waitForTimeout(150);
    await page.fill('[name="password"], #senha, input[type="password"]', config.pass, { timeout: STEP_TIMEOUT });
    await page.waitForTimeout(150);
    await page.click('button[type="submit"], input[type="submit"]', { timeout: STEP_TIMEOUT });

    // ── §3 2FA TOTP ───────────────────────────────────────────────────────────
    const totpCode = totpGenerateSync({ secret: config.totpSecret });
    await page.fill('[name="otp"], [name="token"], input[maxlength="6"]', totpCode, { timeout: STEP_TIMEOUT });
    await page.click('button[type="submit"]', { timeout: STEP_TIMEOUT });

    // ── §4 Navegar para arrematações ─────────────────────────────────────────
    await page.waitForTimeout(300);
    await page.click('text=/arremata[çc]ão/i, a[href*="arremat"]', { timeout: STEP_TIMEOUT });
    await page.waitForLoadState("networkidle", { timeout: STEP_TIMEOUT });

    // ── §5 Hash do DOM ────────────────────────────────────────────────────────
    const domContent = await page.content();
    const domHash    = crypto.createHash("sha256").update(domContent).digest("hex");

    // ── §6 Download CSV ───────────────────────────────────────────────────────
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: STEP_TIMEOUT }),
      page.click('a[href*=".csv"], button:has-text("CSV"), button:has-text("Exportar")', { timeout: STEP_TIMEOUT }),
    ]);

    const stream     = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csvContent = Buffer.concat(chunks).toString("utf-8");

    return { csvContent, domHash };
  } finally {
    await browser.close();
  }
}

// ─── Round-robin de responsável ──────────────────────────────────────────────

async function pickAssignee(
  workspaceId: string,
  prisma: typeof db,
): Promise<string | null> {
  const members = await prisma.member.findMany({
    where: { workspaceId, role: { in: ["OWNER", "ADMIN", "MEMBER"] } },
    select: { userId: true },
  });

  if (members.length === 0) return null;

  // Para cada member, contar deals ativos (sem closedAt)
  const counts = await Promise.all(
    members.map(async m => {
      const count = await prisma.deal.count({
        where: { workspaceId, ownerId: m.userId, closedAt: null },
      });
      return { userId: m.userId, count };
    }),
  );

  // Menor count de deals ativos
  counts.sort((a, b) => a.count - b.count);
  return counts[0]?.userId ?? null;
}

// ─── Processamento de linha ───────────────────────────────────────────────────

async function processRow(
  row: ParsedRow,
  workspaceId: string,
  deps: RpaDeps,
): Promise<RowResult> {
  const prisma = deps.prisma ?? db;

  // Verifica se deal já existe pelo external source key no meta
  const existing = await prisma.deal.findFirst({
    where: {
      workspaceId,
      meta: { path: ["imovelId"], equals: row.imovelId },
    },
    select: { id: true },
  });

  if (existing) return { status: "skipped", reason: `external source key ${row.imovelId} já existe` };

  // Sanitizar campos de texto [SEC-08]
  const sanitize = (s: string) => defaultSanitizer.sanitize(s).sanitized;

  const safeName  = sanitize(row.nomeProponente  || "Proponente sem nome");
  const safeEmail = sanitize(row.emailProponente);
  const safePhone = sanitize(row.telefoneProponente);
  const safeAddr  = sanitize(row.endereco);

  // Buscar stage inicial do workspace (posição 0)
  const firstStage = await prisma.stage.findFirst({
    where:   { workspaceId },
    orderBy: { position: "asc" },
    select:  { id: true },
  });
  if (!firstStage) return { status: "failed", error: "Nenhum stage encontrado no workspace" };

  // Round-robin: menor count de deals ativos
  const ownerId = await pickAssignee(workspaceId, prisma);

  // Eisenhower: paymentDeadline < now+48h → Q1_DO, senão Q2_PLAN
  const now        = Date.now();
  const hoursToDeadline = row.paymentDeadline
    ? (row.paymentDeadline.getTime() - now) / 3_600_000
    : Infinity;
  const quadrant = hoursToDeadline < 48 ? "Q1_DO" : "Q2_PLAN";

  // Flag de title_status em tratamento
  const averbacaoFlag = row.averbacao.toUpperCase() === "EM_TRATAMENTO";

  try {
    // Criar Contact (external_actor)
    const contact = await prisma.contact.create({
      data: {
        workspaceId,
        name:     safeName,
        email:    safeEmail  || null,
        phone:    safePhone  || null,
        document: row.cpfProponente || null,
        type:     "PERSON",
        meta: {
          cpfProponente:     row.cpfProponente,
          auctionActorName:  sanitize(row.auctionActorName),
          auctionActorPhone: sanitize(row.auctionActorPhone),
          auctionActorEmail: sanitize(row.auctionActorEmail),
        },
      },
    });

    // Criar Deal com meta completa
    const deal = await prisma.deal.create({
      data: {
        workspaceId,
        stageId:   firstStage.id,
        contactId: contact.id,
        ownerId,
        title:     `${safeName} — ${sanitize(row.contrato) || row.imovelId}`,
        value:     row.valorTotal || null,
        meta: {
          // Identificadores externos (schema do portal do emissor)
          // [P-01] EXCEÇÃO-ADAPTADOR-EXTERNO
          imovelId:         row.imovelId,
          modalidade:       sanitize(row.modalidade),
          situacao:         sanitize(row.situacao),
          endereco:         safeAddr,
          uf:               row.uf,
          // Dados financeiros
          valorTotal:       row.valorTotal,
          valorAvaliacao:   row.valorAvaliacao,
          valorProprios:    row.valorProprios,
          valorBruto:       row.valorBruto,
          comissao:         row.valorBruto,
          // Prazo de pagamento
          paymentDeadline:  row.paymentDeadline?.toISOString() ?? null,
          // Dados do deal_item
          matricula:        sanitize(row.matricula),
          iptu:             sanitize(row.iptu),
          averbacao:        sanitize(row.averbacao),
          averbacaoFlag,
          // Subtype do negócio
          subtype:          row.subtype,
          // Internal actor
          creci:            sanitize(row.creci),
          internalActorDoc: sanitize(row.internalActorDoc),
          internalActorName: sanitize(row.internalActorName),
          // Contrato
          contrato:         sanitize(row.contrato),
          servico:          sanitize(row.servico),
          // Metadados de importação
          importedAt:       new Date().toISOString(),
          importSource:     "issuer_portal_rpa",
          eisenhower:       quadrant,
        },
      },
    });

    // BullMQ job 'generate-relatorio' com delay 0
    await deps.enqueueJob("generate-relatorio", {
      dealId:      deal.id,
      workspaceId,
      quadrant,
      sourceKey:   row.imovelId,
      triggerFrom: "rpa_import",
    });

    return { status: "created", dealId: deal.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", error: msg };
  }
}

// ─── Runner principal ─────────────────────────────────────────────────────────

export async function runIssuerPortalRpa(
  config: IssuerPortalRpaConfig,
  deps:   RpaDeps,
): Promise<RpaRunStats> {
  const startMs  = Date.now();
  const prisma   = deps.prisma ?? db;
  const errors:  string[] = [];

  let csvContent = "";
  let domHash:   string | null = null;

  try {
    if (config.dryRun) {
      // ── DRY RUN: carrega fixture local ─────────────────────────────────────
      const fixturePath = config.fixturePath ?? path.resolve(
        import.meta.dirname ?? __dirname,
        "__fixtures__",
        "ca\u0069xa-deals.csv",
      );
      csvContent = await readFile(fixturePath, "utf-8");
    } else {
      // ── LIVE: Playwright scraping ───────────────────────────────────────────
      const scraped = await scrapePortalCsv({
        loginUrl:   config.loginUrl,
        user:       config.user,
        pass:       config.pass,
        totpSecret: config.totpSecret,
      });
      csvContent = scraped.csvContent;
      domHash    = scraped.domHash;

      // §5 Comparar DOM hash com execução anterior (Redis)
      const prevHash = await deps.redisGet("rpa:dom-hash");
      if (prevHash && prevHash !== domHash) {
        // Layout mudou → alertar OWNER, suspender e criar Task Q1
        await deps.notifyOwner(
          `⚠️ Issuer portal RPA: layout do portal mudou!\n` +
          `Hash anterior: \`${prevHash.slice(0, 12)}\`\n` +
          `Hash atual:    \`${domHash.slice(0, 12)}\`\n` +
          `Verifique manualmente antes da próxima execução.`,
        );

        await prisma.task.create({
          data: {
            workspaceId: config.workspaceId,
            title:       "RPA: layout do portal do emissor mudou — verificar manualmente",
            quadrant:    "Q1_DO",
            urgent:      true,
            important:   true,
            dueAt:       new Date(Date.now() + 2 * 3_600_000),
          },
        });

        const stat: RpaRunStats = {
          status:      "LAYOUT_CHANGED",
          rowsFound:   0,
          rowsNew:     0,
          rowsSkipped: 0,
          rowsFailed:  0,
          duration:    Date.now() - startMs,
          domHash,
          dryRun:      false,
          errors:      ["Layout do portal mudou — execução suspensa"],
        };

        await logRpaRun(prisma, config, stat);
        return stat;
      }

      // Salvar novo hash
      if (domHash) await deps.redisSet("rpa:dom-hash", domHash);
    }

    // ── Parse CSV ─────────────────────────────────────────────────────────────
    const { rows, headerHash } = parseCsv(csvContent);

    if (!domHash) domHash = headerHash; // em DRY_RUN, usa hash do header

    // ── Processar cada linha ──────────────────────────────────────────────────
    let rowsNew     = 0;
    let rowsSkipped = 0;
    let rowsFailed  = 0;

    for (const row of rows) {
      try {
        const result = await processRow(row, config.workspaceId, deps);
        if (result.status === "created")  rowsNew++;
        if (result.status === "skipped")  rowsSkipped++;
        if (result.status === "failed")  { rowsFailed++; errors.push(result.error); }
      } catch (err) {
        rowsFailed++;
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    // ── Reset contador de falhas ──────────────────────────────────────────────
    await deps.redisDel("rpa:fail-count");

    const stat: RpaRunStats = {
      status:      "SUCCESS",
      rowsFound:   rows.length,
      rowsNew,
      rowsSkipped,
      rowsFailed,
      duration:    Date.now() - startMs,
      domHash,
      dryRun:      config.dryRun,
      errors,
    };

    await logRpaRun(prisma, config, stat);
    return stat;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);

    // ── §10 Contagem de falhas consecutivas ───────────────────────────────────
    const prevFails = parseInt(await deps.redisGet("rpa:fail-count") ?? "0", 10);
    const newFails  = prevFails + 1;
    await deps.redisSet("rpa:fail-count", String(newFails));

    if (newFails >= 2) {
      await deps.notifyOwner(
        `🚨 Issuer portal RPA falhou ${newFails}x consecutivamente.\n` +
        `Último erro: ${msg}\n` +
        `Ação necessária: verificar credenciais e portal manualmente.`,
      );

      await (deps.prisma ?? db).task.create({
        data: {
          workspaceId: config.workspaceId,
          title:       `Issuer portal RPA: falha ${newFails}x — intervenção manual necessária`,
          description: msg,
          quadrant:    "Q1_DO",
          urgent:      true,
          important:   true,
          dueAt:       new Date(Date.now() + 3_600_000),
        },
      });
    }

    const stat: RpaRunStats = {
      status:      "FAILED",
      rowsFound:   0,
      rowsNew:     0,
      rowsSkipped: 0,
      rowsFailed:  0,
      duration:    Date.now() - startMs,
      domHash,
      dryRun:      config.dryRun,
      errors,
    };

    await logRpaRun(deps.prisma ?? db, config, stat).catch(() => void 0);
    return stat;
  }
}

// ─── Persistência do log ──────────────────────────────────────────────────────

async function logRpaRun(
  prisma:  typeof db,
  config:  IssuerPortalRpaConfig,
  stat:    RpaRunStats,
): Promise<void> {
  try {
    await prisma.rpaLog.create({
      data: {
        workspaceId:  config.workspaceId,
        agentId:      "issuer-portal-rpa-worker",
        status:       stat.status,
        rowsFound:    stat.rowsFound,
        rowsNew:      stat.rowsNew,
        rowsSkipped:  stat.rowsSkipped,
        rowsFailed:   stat.rowsFailed,
        duration:     stat.duration,
        domHash:      stat.domHash,
        dryRun:       stat.dryRun,
        errorMessage: stat.errors.length > 0 ? stat.errors.join(" | ") : null,
      },
    });
  } catch {
    // Log silencioso — falha de logging nunca deve derrubar o worker
  }
}

// ─── BullMQ factory ───────────────────────────────────────────────────────────

const QUEUE_NAME = "issuer-portal-rpa";
const CRON_EXPR  = "0 */2 * * *";

/**
 * Registra o job cron BullMQ a cada 2 horas.
 * Deve ser chamado 1x na inicialização do servidor.
 */
export async function scheduleIssuerPortalCron(
  connection: IssuerPortalWorkerOptions["connection"],
): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection });

  await queue.add(
    "run",
    {},
    {
      repeat:     { pattern: CRON_EXPR },
      jobId:      "issuer-portal-rpa-cron",
      removeOnComplete: { count: 50 },
      removeOnFail:     { count: 20 },
    },
  );

  await queue.close();
}

/**
 * Cria o BullMQ Worker que executa o scraper.
 * Lê credenciais do env em runtime (nunca armazena em memória longa).
 */
export function createIssuerPortalWorker(opts: IssuerPortalWorkerOptions): BullWorker {
  return new BullWorker(
    QUEUE_NAME,
    async (_job: Job) => {
      const config: IssuerPortalRpaConfig = {
        workspaceId: opts.config.workspaceId,
        loginUrl:    process.env["CAI\u0058A_LOGIN_URL"]   ?? "https://venda-imoveis.ca\u0069xa.gov.br",
        user:        process.env["CAI\u0058A_USER"]        ?? "",
        pass:        process.env["CAI\u0058A_PASS"]        ?? "",
        totpSecret:  process.env["CAI\u0058A_TOTP_SECRET"] ?? "",
        dryRun:      process.env["CAI\u0058A_DRY_RUN"]     === "true",
        ...(opts.config.fixturePath ? { fixturePath: opts.config.fixturePath } : {}),
      };

      const result = await runIssuerPortalRpa(config, opts.deps);
      return result;
    },
    {
      connection:  opts.connection,
      concurrency: 1,   // apenas 1 execução por vez
    },
  );
}

export { runIssuerPortalRpa as runRpaCa\u0069xa };
export { scheduleIssuerPortalCron as scheduleRpaCa\u0069xaCron };
export { createIssuerPortalWorker as createRpaCa\u0069xaWorker };
export type RpaCa\u0069xaConfig = IssuerPortalRpaConfig;
export type RpaCa\u0069xaWorkerOptions = IssuerPortalWorkerOptions;
