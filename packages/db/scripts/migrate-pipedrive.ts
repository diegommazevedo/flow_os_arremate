/**
 * FlowOS v4 — Migração Pipedrive → FlowOS.
 *
 * [SEC-02] sem credenciais hardcoded.
 * [SEC-08] todo texto externo é sanitizado antes de persistir.
 * [P-01] termos setoriais confinados às funções marcadas como mapeamento externo.
 */

import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { PrismaClient, TaskPriority, type Prisma } from "@prisma/client";
import { defaultSanitizer } from "@flow-os/core";
import { UF_DEPARTMENT_MAP } from "@flow-os/templates";

type CSVRow = Record<string, string>;

interface DealCreateInput {
  externalId: string;
  title: string;
  actorName: string;
  actorCity: string;
  actorUF: string;
  meta: Prisma.InputJsonObject;
}

interface MigrationStats {
  total: number;
  created: number;
  skipped: number;
  failed: number;
}

const PIPELINE_LABEL_BY_ID: Record<string, string> = {
  triagem: "Triagem",
  sem_acesso_grupo: "Sem Acesso ao Grupo",
  primeiro_contato: "1º Contato c/ Cliente",
  fgts_contratacao: "FGTS Contratação",
  itbi: "ITBI",
  escritura: "Escritura Pública Contratação",
  registro: "Registro de Imóveis",
  troca_titularidade: "Troca de Titularidade",
  envio_docs_cef: "Envio Docs para CEF",
  docs_aguardando_cef: "Docs Enviados / Aguardando CEF",
  emissao_nf: "Emissão NF",
  processo_concluido: "Processo Concluído",
};

const ARGV = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const index = ARGV.indexOf(flag);
  return index >= 0 ? ARGV[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return ARGV.includes(flag);
}

const INPUT_PATH = getArg("--input");
const WORKSPACE_ID = getArg("--org-id");
const DRY_RUN = !hasFlag("--no-dry-run");
const LIMIT = Math.max(0, Number(getArg("--limit") ?? "0")) || Infinity;

if (!INPUT_PATH || !WORKSPACE_ID) {
  console.error("Uso: pnpm migrate:pipedrive --input <csv> --org-id <workspaceId> [--no-dry-run] [--limit N]");
  process.exit(1);
}

const REQUIRED_INPUT_PATH = INPUT_PATH as string;
const REQUIRED_WORKSPACE_ID = WORKSPACE_ID as string;
const RESOLVED_INPUT = path.resolve(REQUIRED_INPUT_PATH);
if (!fs.existsSync(RESOLVED_INPUT)) {
  console.error(`Arquivo não encontrado: ${RESOLVED_INPUT}`);
  process.exit(1);
}

function sanitize(value: string): string {
  return defaultSanitizer.clean(value);
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ";" && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current.trim());
  return result;
}

async function loadCsv(filePath: string): Promise<CSVRow[]> {
  const lines: string[] = [];
  const reader = createInterface({
    input: fs.createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (line.trim()) lines.push(line);
  }

  if (lines.length < 2) throw new Error("CSV vazio ou sem dados.");

  const header = splitCsvLine(lines[0]!).map((value) => sanitize(value));

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: CSVRow = {};
    for (const [index, key] of header.entries()) {
      row[key] = sanitize(values[index] ?? "");
    }
    return row;
  });
}

function field(row: CSVRow, ...aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (value) return sanitize(value);
  }
  return undefined;
}

function extractCHB(title: string): string {
  return title.split(" - ")[0]?.trim() ?? "";
}

function extractName(title: string): string {
  const parts = title.split(" - ");
  return parts[1]?.trim() ?? "";
}

function extractCity(title: string): string {
  const last = title.split(" - ").pop() ?? "";
  return last.split("/")[0]?.trim() ?? "";
}

function extractUF(title: string): string {
  const last = title.split(" - ").pop() ?? "";
  return last.split("/")[1]?.trim().substring(0, 2) ?? "";
}

/**
 * [P-01] MAPEAMENTO EXTERNO
 */
function mapModalidadeToSubtype(modalidade?: string): string {
  if (!modalidade) return "FINANCIAMENTO";
  if (modalidade.includes("Licitação")) return "LICITACAO_ABERTA";
  if (modalidade.includes("Direta")) return "A_VISTA";
  return "FINANCIAMENTO";
}

function parseBool(value?: string): boolean | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["sim", "true", "1", "yes"].includes(normalized)) return true;
  if (["não", "nao", "false", "0", "no"].includes(normalized)) return false;
  return null;
}

function parseDecimal(value?: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(?:,|$))/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDate(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * [P-01] MAPEAMENTO EXTERNO
 */
function deriveBoletoStatus(situacao?: string): string {
  if (!situacao) return "PENDENTE";
  if (situacao.includes("COM BOLETO PAGO")) return "PAGO";
  if (situacao.includes("VENC")) return "VENCIDO";
  if (situacao.includes("AGUARD")) return "AGUARDANDO";
  return "PENDENTE";
}

/**
 * [P-01] MAPEAMENTO EXTERNO
 */
function mapPipelineStage(rawStage?: string): string {
  if (!rawStage) return "triagem";

  const normalized = rawStage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_");

  const known = Object.keys(PIPELINE_LABEL_BY_ID).find((id) => normalized.includes(id));
  if (known) return known;

  if (normalized.includes("sem_acesso")) return "sem_acesso_grupo";
  if (normalized.includes("primeiro_contato")) return "primeiro_contato";
  if (normalized.includes("fgts")) return "fgts_contratacao";
  if (normalized.includes("escritura")) return "escritura";
  if (normalized.includes("registro")) return "registro";
  if (normalized.includes("troca")) return "troca_titularidade";
  if (normalized.includes("aguardando_cef")) return "docs_aguardando_cef";
  if (normalized.includes("emissao_nf")) return "emissao_nf";
  if (normalized.includes("concluido")) return "processo_concluido";
  return "triagem";
}

function mapPipedriveDeal(row: CSVRow): DealCreateInput {
  const title = field(row, "Negócio - Título", "Titulo", "Título") ?? "";
  const stageId = mapPipelineStage(field(row, "Negócio - Etapa do funil", "Negócio - Fase", "Negócio - Stage"));

  return {
    externalId: extractCHB(title),
    title,
    actorName: extractName(title),
    actorCity: extractCity(title),
    actorUF: extractUF(title),
    meta: {
      imovelId: extractCHB(title),
      chb: extractCHB(title),
      uf: extractUF(title),
      cidade: extractCity(title),

      modalidade: field(row, "Negócio - Modalidade") ?? null,
      subtype: mapModalidadeToSubtype(field(row, "Negócio - Modalidade")),
      formaPagamento: field(row, "Negócio - Forma de Pagamento") ?? null,
      tipoProduto: field(row, "Negócio - Tipo de Produto") ?? null,
      formulario: field(row, "Negócio - Formulário") ?? null,
      valorArrematacao: parseDecimal(field(row, "Negócio - Valor da Arrematação")),
      valorFinanciado: parseDecimal(field(row, "Negócio - Valor: Financiado")),
      valorFgts: parseDecimal(field(row, "Negócio - Valor FGTS")),
      valorProprios: parseDecimal(field(row, "Negócio - Valor: Recursos Próprios")),
      valorBruto: parseDecimal(field(row, "Negócio - Valor bruto")),
      dataPropostaVencedora: parseDate(field(row, "Negócio - Data da Proposta Vencedora")),
      dataContratacao: parseDate(field(row, "Negócio - Data da Contratação")),
      dataVencimentoBoleto: parseDate(field(row, "Negócio - Data Vencimento do Boleto")),
      dataAssinaturaEsperada: parseDate(field(row, "Negócio - Data de Assinatura Contrato Esperada")),
      dataFechamentoEsperada: parseDate(field(row, "Negócio - Data de fechamento esperada")),
      corretoraNome: field(row, "Negócio - Nome da Corretora") ?? null,
      creci: field(row, "Negócio - CRECI") ?? null,
      corretorNome: field(row, "Negócio - Nome do Corretor", "Negócio - Corretor") ?? null,
      iptu: field(row, "Negócio - IPTU") ?? null,
      contrato: field(row, "Negócio - Contrato") ?? null,
      servico: field(row, "Negócio - Serviço") ?? null,

      paymentDeadline: parseDate(field(row, "Negócio - Data Vencimento do Boleto")),
      boletoStatus: deriveBoletoStatus(field(row, "Negócio - Situação")),

      currentPhase: stageId,
      kanbanStatus: "em_progresso",
      eisenhower: "Q2_PLAN",
      criadoPorAutomacao: parseBool(field(row, "Negócio - Criado por Automação")) ?? false,
      linkGrupoWhatsApp: field(row, "Negócio - Link do Grupo WhatsApp") ?? null,

      endereco: field(row, "Negócio - Endereço do Imóvel") ?? null,
      matricula: field(row, "Negócio - Matrícula do Imóvel") ?? null,
      linkMatricula: field(row, "Negócio - Link da Matrícula") ?? null,
      valorAvaliacao: parseDecimal(field(row, "Negócio - Valor de Avaliação")),
      atendimentoRevisado: parseBool(field(row, "Negócio - Atendimento Revisado?")) ?? false,

      leiloes: {
        responsavel: field(row, "Negócio - Responsável: Leilões") ?? null,
        dataInicio: parseDate(field(row, "Negócio - Data Início: Leilões")),
        executor: field(row, "Negócio - Executor: Leilões") ?? null,
        statusCaixa: field(row, "Negócio - Status Importado da Caixa") ?? null,
        status: field(row, "Negócio - Status: Leilões") ?? null,
        protocolo: field(row, "Negócio - Nº Protocolo: Leilões") ?? null,
        dataVencimentoProtocolo: parseDate(field(row, "Negócio - Data Vencimento Protocolo: Leilões")),
        dataTermino: parseDate(field(row, "Negócio - Data Término: Leilões")),
      },

      trocaTitularidade: {
        responsavel: field(row, "Negócio - Responsável: Troca de Titularidade") ?? null,
        dataInicio: parseDate(field(row, "Negócio - Data Início: Troca de Titularidade")),
        executor: field(row, "Negócio - Executor: Troca de Titularidade") ?? null,
        status: field(row, "Negócio - Status: Troca de Titularidade") ?? null,
        protocolo: field(row, "Negócio - Nº Protocolo: Troca de Titularidade") ?? null,
        dataTermino: parseDate(field(row, "Negócio - Data Término: Troca de Titularidade")),
      },

      condominio: {
        responsavel: field(row, "Negócio - Responsável: Condomínio") ?? null,
        dataInicio: parseDate(field(row, "Negócio - Data Início: Condomínio")),
        executor: field(row, "Negócio - Executor: Condomínio") ?? null,
        possui: parseBool(field(row, "Negócio - Possui Condomínio?")),
        status: field(row, "Negócio - Status: Condomínio") ?? null,
        observacoes: field(row, "Negócio - Observações: Condomínio") ?? null,
        administradora: field(row, "Negócio - Nome da Administradora") ?? null,
        telefone: field(row, "Negócio - Telefone: Condomínio") ?? null,
        email: field(row, "Negócio - E-mail: Condomínio") ?? null,
        responsavelPagamento: field(row, "Negócio - Responsável Pagamento: Condomínio") ?? null,
        dataTermino: parseDate(field(row, "Negócio - Data Término: Condomínio")),
      },

      desocupacao: {
        responsavel: field(row, "Negócio - Responsável: Desocupação") ?? null,
        elegivel: parseBool(field(row, "Negócio - Elegível: Desocupação")),
        clienteQuer: parseBool(field(row, "Negócio - Cliente quer Desocupação?")),
        dataInicio: parseDate(field(row, "Negócio - Data Início: Desocupação")),
        status: field(row, "Negócio - Status: Desocupação") ?? null,
        dataTermino: parseDate(field(row, "Negócio - Data Término: Desocupação")),
      },

      itbi: {
        status: field(row, "Negócio - Status: ITBI") ?? null,
        responsavel: field(row, "Negócio - Responsável: ITBI") ?? null,
        dataInicio: parseDate(field(row, "Negócio - Data Início: ITBI")),
        dataTermino: parseDate(field(row, "Negócio - Data Término: ITBI")),
        observacoes: field(row, "Negócio - Observações: ITBI") ?? null,
      },

      registro: {
        status: field(row, "Negócio - Status: Registro") ?? null,
        responsavel: field(row, "Negócio - Responsável: Registro") ?? null,
        protocolo: field(row, "Negócio - Nº Protocolo: Registro") ?? null,
        cartorio: field(row, "Negócio - Cartório: Registro") ?? null,
        dataInicio: parseDate(field(row, "Negócio - Data Início: Registro")),
        dataTermino: parseDate(field(row, "Negócio - Data Término: Registro")),
        observacoes: field(row, "Negócio - Observações: Registro") ?? null,
      },

      iptuStatus: {
        status: field(row, "Negócio - Status: IPTU") ?? null,
        responsavel: field(row, "Negócio - Responsável: IPTU") ?? null,
        observacoes: field(row, "Negócio - Observações: IPTU") ?? null,
        dataTermino: parseDate(field(row, "Negócio - Data Término: IPTU")),
      },

      pipedriveId: Number.parseInt(field(row, "Negócio - ID") ?? "", 10) || null,
      pipedriveOrigemId: field(row, "Negócio - ID de origem") ?? null,
      proprietarioPipedrive: field(row, "Negócio - Proprietário") ?? null,
      emailCcoEspecifico: field(row, "Negócio - Email CCO Específico") ?? null,
      actorName: extractName(title),
      actorCity: extractCity(title),
      actorUF: extractUF(title),
    },
  };
}

function selectStageLabel(stageId: string): string {
  return PIPELINE_LABEL_BY_ID[stageId] ?? PIPELINE_LABEL_BY_ID["triagem"]!;
}

async function resolveStageId(db: PrismaClient, workspaceId: string, stageId: string): Promise<string> {
  const label = selectStageLabel(stageId);
  const stage = await db.stage.findFirst({
    where: { workspaceId, name: label },
    select: { id: true },
  });

  if (stage) return stage.id;

  const fallback = await db.stage.findFirst({
    where: { workspaceId },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  if (!fallback) throw new Error(`Workspace ${workspaceId} não possui stages configurados.`);
  return fallback.id;
}

async function autoAssignDepartamento(
  db: PrismaClient,
  uf: string,
  workspaceId: string,
): Promise<string | null> {
  // MAPEAMENTO EXTERNO — chaves genéricas definidas em @flow-os/templates
  const nomeDept = UF_DEPARTMENT_MAP[uf.toUpperCase()];
  if (!nomeDept) return null;

  const dept = await db.department.findFirst({
    where: { workspaceId, nome: nomeDept },
    select: { id: true },
  });

  return dept?.id ?? null;
}

async function isDuplicate(db: PrismaClient, workspaceId: string, externalId: string): Promise<boolean> {
  const existing = await db.deal.findFirst({
    where: {
      workspaceId,
      meta: { path: ["imovelId"], equals: externalId },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function upsertContact(db: PrismaClient, workspaceId: string, mapped: DealCreateInput, row: CSVRow): Promise<string> {
  const email = field(row, "Pessoa - Email", "Contato - Email", "Negócio - Email");
  const phone = field(row, "Pessoa - Telefone", "Contato - Telefone", "Negócio - Telefone");

  const existing = email
    ? await db.contact.findFirst({
        where: { workspaceId, email },
        select: { id: true },
      })
    : null;

  if (existing) return existing.id;

  const contact = await db.contact.create({
    data: {
      workspaceId,
      name: mapped.actorName || mapped.title,
      email: email ?? null,
      phone: phone ?? null,
      type: "PERSON",
      meta: {
        source: "pipedrive_migration",
        pipedriveOwner: field(row, "Negócio - Proprietário") ?? null,
      },
    },
    select: { id: true },
  });

  return contact.id;
}

async function createDeal(db: PrismaClient, workspaceId: string, mapped: DealCreateInput, contactId: string): Promise<string> {
  const currentPhase = typeof mapped.meta["currentPhase"] === "string" ? mapped.meta["currentPhase"] : "triagem";
  const paymentDeadline = typeof mapped.meta["paymentDeadline"] === "string" ? mapped.meta["paymentDeadline"] : null;
  const valorArrematacao = typeof mapped.meta["valorArrematacao"] === "number" ? mapped.meta["valorArrematacao"] : null;
  const uf = typeof mapped.meta["uf"] === "string" ? mapped.meta["uf"] : "";
  const stageId = await resolveStageId(db, workspaceId, currentPhase);
  const deadline = paymentDeadline ? new Date(paymentDeadline) : null;
  const departamentoId = uf ? await autoAssignDepartamento(db, uf, workspaceId) : null;

  const deal = await db.deal.create({
    data: {
      workspaceId,
      stageId,
      contactId,
      title: mapped.title,
      value: valorArrematacao,
      expectedCloseDate: deadline,
      meta: mapped.meta,
    },
    select: { id: true },
  });
  // @ts-expect-error Prisma JsonObject exposes dynamic keys via index signature.

  if (mapped.meta.modalidade === "Licitação Aberta") {
    await db.dealNote.create({
      data: {
        workspaceId,
        dealId: deal.id,
        authorId: "pipedrive_migration",
        authorName: "Migração Pipedrive",
        content: "Não é necessário elaborar o relatório. Modalidade dessa arrematação é Licitação Aberta.",
      },
      select: { id: true },
    });

    await db.chatSession.upsert({
      where: { taskId: task.id },
      create: {
        workspaceId,
        taskId: task.id,
        status: "ABERTO",
        departamentoId,
        totalAtendimentos: 1,
      },
      update: {
        departamentoId,
      },
    });
  }

  // @ts-expect-error Prisma JsonObject exposes dynamic keys via index signature.
  const stagnatedDays = Number(mapped.meta.stagnatedDays ?? 0);
  // @ts-expect-error Prisma JsonObject exposes dynamic keys via index signature.
  if (mapped.meta.condominio && typeof mapped.meta.condominio === "object" && stagnatedDays > 7) {
    const task = await db.task.create({
      data: {
        workspaceId,
        dealId: deal.id,
        title: "Condomínio - Atualizar tratativas",
        type: "Condomínio",
        quadrant: "Q1_DO",
        priority: TaskPriority.HIGH,
        urgent: true,
        important: true,
        dueAt: deadline,
      },
    });
  }

  return deal.id;
}

async function run() {
  const db = new PrismaClient({ log: ["error"] });
  const startedAt = new Date();

  try {
    const workspace = await db.workspace.findUnique({
      where: { id: REQUIRED_WORKSPACE_ID },
      select: { id: true, name: true },
    });

    if (!workspace) {
      throw new Error(`Workspace ${WORKSPACE_ID} não encontrado.`);
    }

    const rows = await loadCsv(RESOLVED_INPUT);
    const stats: MigrationStats = { total: 0, created: 0, skipped: 0, failed: 0 };

    console.log(`CSV: ${RESOLVED_INPUT}`);
    console.log(`Workspace: ${workspace.name}`);
    console.log(`Dry run: ${DRY_RUN ? "sim" : "não"}`);

    for (const row of rows.slice(0, LIMIT)) {
      stats.total += 1;

      try {
        const mapped = mapPipedriveDeal(row);

        if (!mapped.externalId) {
          stats.failed += 1;
          console.warn(`Linha ignorada: título sem CHB válido (${mapped.title || "sem título"})`);
          continue;
        }

        const duplicated = await isDuplicate(db, REQUIRED_WORKSPACE_ID, mapped.externalId);
        if (duplicated) {
          stats.skipped += 1;
          console.log(`↷ ${mapped.externalId} já existe`);
          continue;
        }

        if (DRY_RUN) {
          stats.created += 1;
          console.log(`[DRY] ${mapped.externalId} | ${mapped.title} | fase ${String(mapped.meta["currentPhase"] ?? "triagem")}`);
          continue;
        }

        const contactId = await upsertContact(db, REQUIRED_WORKSPACE_ID, mapped, row);
        const dealId = await createDeal(db, REQUIRED_WORKSPACE_ID, mapped, contactId);
        stats.created += 1;
        console.log(`✓ ${mapped.externalId} | deal ${dealId}`);
      } catch (error) {
        stats.failed += 1;
        console.error("Erro ao processar linha:", error);
      }
    }

    const summaryPath = path.resolve(
      path.dirname(RESOLVED_INPUT),
      `migration-summary-${startedAt.toISOString().slice(0, 10)}.json`,
    );

    fs.writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          runAt: startedAt.toISOString(),
          input: RESOLVED_INPUT,
          workspaceId: WORKSPACE_ID,
          dryRun: DRY_RUN,
          stats,
        },
        null,
        2,
      ),
      "utf-8",
    );

    console.log("Resumo:");
    console.log(`  Total: ${stats.total}`);
    console.log(`  Criados: ${stats.created}`);
    console.log(`  Ignorados: ${stats.skipped}`);
    console.log(`  Falhos: ${stats.failed}`);
    console.log(`  Summary: ${summaryPath}`);

    if (stats.failed > 0) process.exit(2);
  } finally {
    await db.$disconnect();
  }
}

run().catch((error) => {
  console.error("Erro fatal na migração:", error);
  process.exit(1);
});
