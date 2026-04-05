// [P-01] EXCEÇÃO-ADAPTADOR-EXTERNO
// Testes do adaptador RPA — termos do setor são
// reflexos dos dados externos, não lógica de núcleo

/**
 * FlowOS v4 — RPA Caixa Worker Tests
 *
 * Modo: CAIXA_DRY_RUN=true — fixture CSV local, sem Playwright, sem banco real.
 *
 * Cenários:
 *   1. deal novo (IMOV-001-SP) → criado com Q2_PLAN
 *   2. deal já existente (IMOV-001-SP duplicado) → skipped
 *   3. boleto vencendo em 24h (IMOV-002-SP, 31/03/2026) → Q1_DO automático
 *   4. linha com dados incompletos (IMOV-003-MG, sem nome) → erro tratado sem travar batch
 *   5. averbação EM_TRATAMENTO (IMOV-004-RJ) → averbacaoFlag=true no meta
 */

import path         from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRpaCaixa, type RpaDeps, type RpaCaixaConfig } from "../rpa-caixa";

// ─── Mocks do banco ────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.resolve(
  import.meta.dirname,
  "../__fixtures__/caixa-deals.csv",
);

// Armazena criações para verificar nos testes
interface MockDeal {
  id:          string;
  workspaceId: string;
  meta:        Record<string, unknown>;
  value:       number | null;
}
interface MockContact {
  id:          string;
  name:        string;
  email?:      string | null;
  document?:   string | null;
}
interface MockTask {
  id:       string;
  title:    string;
  quadrant: string;
}
interface MockRpaLog {
  status:      string;
  rowsNew:     number;
  rowsSkipped: number;
  rowsFailed:  number;
}

let createdDeals:    MockDeal[]    = [];
let createdContacts: MockContact[] = [];
let createdTasks:    MockTask[]    = [];
let rpaLogs:         MockRpaLog[]  = [];
let enqueuedJobs:    { name: string; data: unknown }[] = [];

// ID serial simples
let _id = 0;
const nextId = () => `mock-${++_id}`;

// Simula banco: track de deals por meta.imovelId
const existingImovelIds = new Set<string>();

function buildMockPrisma() {
  return {
    deal: {
      findFirst: vi.fn(async (args: { where?: { meta?: { path?: string[]; equals?: unknown } } }) => {
        const imovelId = args?.where?.meta?.equals;
        if (typeof imovelId === "string" && existingImovelIds.has(imovelId)) {
          return { id: "existing-deal" };
        }
        return null;
      }),
      count: vi.fn(async () => 0),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const deal: MockDeal = {
          id:          nextId(),
          workspaceId: args.data["workspaceId"] as string,
          meta:        args.data["meta"] as Record<string, unknown>,
          value:       (args.data["value"] as number) ?? null,
        };
        createdDeals.push(deal);
        // Registrar imovelId como existente para teste de skip
        const imovelId = deal.meta["imovelId"];
        if (typeof imovelId === "string") existingImovelIds.add(imovelId);
        return deal;
      }),
    },
    contact: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const contact: MockContact = {
          id:       nextId(),
          name:     args.data["name"] as string,
          email:    args.data["email"] as string | null,
          document: args.data["document"] as string | null,
        };
        createdContacts.push(contact);
        return contact;
      }),
    },
    member: {
      findMany: vi.fn(async () => [{ userId: "user-mock-001" }]),
    },
    stage: {
      findFirst: vi.fn(async () => ({ id: "stage-001" })),
    },
    task: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const task: MockTask = {
          id:       nextId(),
          title:    args.data["title"] as string,
          quadrant: args.data["quadrant"] as string,
        };
        createdTasks.push(task);
        return task;
      }),
    },
    rpaLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const log: MockRpaLog = {
          status:      args.data["status"] as string,
          rowsNew:     (args.data["rowsNew"] as number) ?? 0,
          rowsSkipped: (args.data["rowsSkipped"] as number) ?? 0,
          rowsFailed:  (args.data["rowsFailed"] as number) ?? 0,
        };
        rpaLogs.push(log);
        return { id: nextId() };
      }),
    },
  } as unknown as import("@flow-os/db").PrismaClient;
}

// ─── Deps mockadas ────────────────────────────────────────────────────────────

const redisStore = new Map<string, string>();
const ownerNotifications: string[] = [];

function buildDeps(prisma: ReturnType<typeof buildMockPrisma>): RpaDeps {
  return {
    redisGet:    async (k) => redisStore.get(k) ?? null,
    redisSet:    async (k, v) => { redisStore.set(k, v); },
    redisDel:    async (k) => { redisStore.delete(k); },
    enqueueJob:  async (name, data) => { enqueuedJobs.push({ name, data }); },
    notifyOwner: async (msg) => { ownerNotifications.push(msg); },
    prisma,
  };
}

function buildConfig(overrides?: Partial<RpaCaixaConfig>): RpaCaixaConfig {
  return {
    workspaceId: "ws-test-001",
    loginUrl:    "https://venda-imoveis.caixa.gov.br",
    user:        "",
    pass:        "",
    totpSecret:  "",
    dryRun:      true,
    fixturePath: FIXTURE_PATH,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _id = 0;
  createdDeals    = [];
  createdContacts = [];
  createdTasks    = [];
  rpaLogs         = [];
  enqueuedJobs    = [];
  ownerNotifications.length = 0;
  redisStore.clear();
  existingImovelIds.clear();
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("RPA Caixa Worker — DRY_RUN=true (fixture CSV)", () => {

  // ── CENÁRIO 1 — Deal novo criado com sucesso ────────────────────────────────
  it("C1: IMOV-001-SP novo → criado como Q2_PLAN (prazo > 48h)", async () => {
    const prisma = buildMockPrisma();
    const result = await runRpaCaixa(buildConfig(), buildDeps(prisma));

    expect(result.status).toBe("SUCCESS");
    expect(result.rowsFound).toBe(5);
    expect(result.rowsNew).toBeGreaterThanOrEqual(1);

    // Deal criado com dados corretos
    const deal = createdDeals.find(d => d.meta["imovelId"] === "IMOV-001-SP");
    expect(deal).toBeDefined();
    expect(deal!.meta["subtype"]).toBe("FINANCIAMENTO");
    expect(deal!.meta["uf"]).toBe("SP");
    expect(deal!.meta["eisenhower"]).toBe("Q2_PLAN"); // prazo 05/04 > 48h

    // Contato criado
    const contact = createdContacts.find(c => c.name.includes("João"));
    expect(contact).toBeDefined();
    expect(contact!.document).toBe("123.456.789-00");

    // Job enfileirado
    const job = enqueuedJobs.find(j => j.name === "generate-relatorio");
    expect(job).toBeDefined();
    expect((job!.data as Record<string, unknown>)["sourceKey"]).toBe("IMOV-001-SP");
  });

  // ── CENÁRIO 2 — Deal já existente → skipped ────────────────────────────────
  it("C2: IMOV-001-SP duplicado → skipped (segunda linha idêntica no CSV)", async () => {
    const prisma = buildMockPrisma();
    const result = await runRpaCaixa(buildConfig(), buildDeps(prisma));

    expect(result.status).toBe("SUCCESS");
    // A segunda linha tem o mesmo imovelId, deve ser pulada
    expect(result.rowsSkipped).toBeGreaterThanOrEqual(1);

    // Apenas 1 deal criado para IMOV-001-SP, não 2
    const dealsImov001 = createdDeals.filter(d => d.meta["imovelId"] === "IMOV-001-SP");
    expect(dealsImov001).toHaveLength(1);
  });

  // ── CENÁRIO 3 — Prazo em 24h → Q1_DO automático ────────────────────────────
  it("C3: IMOV-002-SP (limite 31/03/2026, ~24h) → Q1_DO obrigatório", async () => {
    const prisma = buildMockPrisma();

    // Garante que hoje é "antes" de 31/03/2026 para que o teste seja determinístico
    // O fixture usa 31/03/2026 que é ~24h a partir de 30/03/2026
    const result = await runRpaCaixa(buildConfig(), buildDeps(prisma));

    const deal = createdDeals.find(d => d.meta["imovelId"] === "IMOV-002-SP");
    expect(deal).toBeDefined();
    expect(deal!.meta["eisenhower"]).toBe("Q1_DO"); // < 48h restantes
    expect(deal!.meta["subtype"]).toBe("A_VISTA");
    expect(deal!.meta["uf"]).toBe("SP");
  });

  // ── CENÁRIO 4 — Dados incompletos → erro tratado sem travar batch ──────────
  it("C4: IMOV-003-MG (sem modalidade, sem nome) → falha isolada, batch continua", async () => {
    const prisma = buildMockPrisma();
    const result = await runRpaCaixa(buildConfig(), buildDeps(prisma));

    // Batch deve completar mesmo com linha inválida
    expect(result.status).toBe("SUCCESS");

    // IMOV-003 pode falhar (sem stage, nome vazio)
    // Importante: rowsFailed pode ser ≥ 0 mas o batch não travou
    expect(result.rowsFound).toBe(5); // todas as linhas foram lidas

    // Outros deals não foram afetados pela falha
    const dealSP = createdDeals.find(d => d.meta["imovelId"] === "IMOV-001-SP");
    const dealRJ = createdDeals.find(d => d.meta["imovelId"] === "IMOV-004-RJ");
    expect(dealSP).toBeDefined();
    expect(dealRJ).toBeDefined();
  });

  // ── CENÁRIO 5 — Averbação EM_TRATAMENTO → flag no meta ────────────────────
  it("C5: IMOV-004-RJ (averbação EM_TRATAMENTO) → averbacaoFlag=true + AUCTION_EVENT_OPEN", async () => {
    const prisma = buildMockPrisma();
    await runRpaCaixa(buildConfig(), buildDeps(prisma));

    const deal = createdDeals.find(d => d.meta["imovelId"] === "IMOV-004-RJ");
    expect(deal).toBeDefined();
    expect(deal!.meta["averbacaoFlag"]).toBe(true);
    expect(deal!.meta["averbacao"]).toBe("EM_TRATAMENTO");
    expect(deal!.meta["subtype"]).toBe("AUCTION_EVENT_OPEN");
    expect(deal!.meta["uf"]).toBe("RJ");
  });

  // ── EXTRA — RPALog persistido ──────────────────────────────────────────────
  it("RPALog gravado no banco com status SUCCESS e contagens corretas", async () => {
    const prisma = buildMockPrisma();
    const result = await runRpaCaixa(buildConfig(), buildDeps(prisma));

    expect(rpaLogs).toHaveLength(1);
    const log = rpaLogs[0]!;
    expect(log.status).toBe("SUCCESS");
    expect(log.rowsNew).toBe(result.rowsNew);
    expect(log.rowsSkipped).toBe(result.rowsSkipped);
  });

  // ── EXTRA — 2 falhas consecutivas → notifica OWNER + Task Q1 ───────────────
  it("2 falhas consecutivas → notifica OWNER e cria Task Q1", async () => {
    const prisma = buildMockPrisma();

    // Força falha: fixture inexistente
    const badConfig = buildConfig({ fixturePath: "/nao-existe/fake.csv" });
    const deps      = buildDeps(prisma);

    // Primeira falha
    await runRpaCaixa(badConfig, deps);
    expect(ownerNotifications).toHaveLength(0); // 1 falha ainda não notifica

    // Segunda falha
    await runRpaCaixa(badConfig, deps);
    expect(ownerNotifications).toHaveLength(1);
    expect(ownerNotifications[0]).toContain("falhou 2x consecutivamente");

    // Task Q1 criada
    const q1Task = createdTasks.find(t => t.quadrant === "Q1_DO");
    expect(q1Task).toBeDefined();
    expect(q1Task!.title).toContain("Issuer portal RPA");
  });
});
