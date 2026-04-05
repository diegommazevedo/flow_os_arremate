/**
 * FlowOS v4 — Testes: Gerador de Relatório de Análise
 *
 * Todos os testes usam APENAS mocks — sem Claude real, sem MinIO, sem Playwright.
 * O agente é totalmente injetável, então os testes são rápidos e determinísticos.
 *
 * Cenários:
 *   T1. Geração completa com deal de exemplo → success
 *   T2. title_status=EM_TRATAMENTO → titleStatus.status = 'bloqueante' // [P-01] mock genérico
 *   T3. Falha no MinIO → erro tratado, Document não criado, WhatsApp não enviado
 *   T4. Falha no Claude → retry com gpt-4o-mini (fallback)
 *   T5. URL presigned prestes a vencer → regenerar antes de enviar WhatsApp
 */

// [P-01] DEBT-ARQUITETURAL: generateRelatorioImovel pertence a
// packages/templates — migração planejada para MVP2.
// Nome da função reflete o template, não o núcleo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateRelatorioImovel,
  ReportAnaliseSchema,
  type RelatorioDeps,
  type RelatorioPayload,
  type ReportAnalise,
} from "../relatorio-imovel";
import type { VectorChunk } from "../../token-router";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Constrói um JSON válido que satisfaz o ReportAnaliseSchema */
function makeValidReport(overrides?: Partial<ReportAnalise>): string {
  const base: ReportAnalise = {
    resumo: "Deal_item em modalidade deal_item_type. Situação geral favorável para conclusão do processo.",
    titleStatus: {
      status:   "ok",
      mensagem: "O title_status está regular. Nenhum impedimento identificado no property_id.",
    },
    riscos: [
      {
        titulo:    "Débitos de phase_tax_ref",
        descricao: "Verifique se há débitos de phase_tax_ref anteriores ao deal_item que possam ser transferidos.",
        nivel:     "medio",
      },
    ],
    proximosPassos: [
      { ordem: 1, acao: "Envie sua documentação de identificação.", prazo: "5 dias úteis" },
      { ordem: 2, acao: "Aguarde a guia de phase_tax emitida pelo órgão competente.", prazo: "10 dias úteis" },
    ],
    prazosCriticos: {
      paymentDeadline: "Você tem 6 dias para efetuar o payment_deadline.",
      processo:        "O processo completo leva em média 6 a 9 meses.",
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

// ─── Tipos de rastreamento ────────────────────────────────────────────────────

interface TrackedDoc  { data: Record<string, unknown> }
interface TrackedMsg  { phone: string; url: string }
interface AuditEntry  { action: string; output: Record<string, unknown> }

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

let createdDocs:  TrackedDoc[]  = [];
let updatedDocs:  Record<string, unknown>[] = [];
let whatsAppSent: TrackedMsg[]  = [];
let auditLog:     AuditEntry[]  = [];

let _id = 0;
const nextId = () => `mock-${++_id}`;

function buildMockPrisma(dealMeta: Record<string, unknown> = {}) {
  return {
    deal: {
      findUniqueOrThrow: vi.fn(async () => ({
        id:    "deal-001",
        title: "Deal item SP",
        meta:  dealMeta,
        contact: { id: "cnt-001", name: "external_actor Silva", phone: "11999990001", email: "actor@test.com" },
        workspace: {
          id:       "ws-001",
          name:     "FlowOS Test Workspace",
          settings: { portalColor: "#2563eb" },
        },
      })),
    },
    document: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const doc = { id: nextId(), ...args.data };
        createdDocs.push({ data: args.data });
        return doc;
      }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        updatedDocs.push(args.data);
        return { id: "doc-mock", url: "https://minio/renewed-url" };
      }),
      // [MULTI-TENANT] freshPresignedUrl agora usa findFirst; mock correspondente
      findFirst: vi.fn(async () => ({
        id:  "doc-mock",
        url: "https://minio/existing-url",
      })),
    },
    workspace: {
      findUniqueOrThrow: vi.fn(async () => ({ id: "ws-001", name: "Test" })),
    },
  } as unknown as import("@flow-os/db").PrismaClient;
}

// ─── Mock Deps ────────────────────────────────────────────────────────────────

/** Buffer PDF fictício para testes (sem Playwright/Chromium) */
const FAKE_PDF = Buffer.from("%PDF-1.4 fake-pdf-for-test");

function buildDeps(overrides?: Partial<RelatorioDeps>): RelatorioDeps {
  return {
    callClaude: vi.fn(async () => makeValidReport()),
    callFallback: vi.fn(async () => makeValidReport()),
    /** Stub que evita a chamada real ao Playwright/Chromium nos testes */
    htmlToPdf: vi.fn(async () => FAKE_PDF),
    vectorSearch: {
      search: vi.fn(async (): Promise<VectorChunk[]> => [
        { id: "faq-1", content: "Risco de phase_tax em UF-X: prazo até 60 dias.", score: 0.9, collection: "faq", metadata: {} },
      ]),
      upsert: vi.fn(async () => void 0),
    },
    uploadBuffer:    vi.fn(async () => void 0),
    getPresignedUrl: vi.fn(async () => "https://minio.test/presigned-url"),
    sendWhatsApp: vi.fn(async (phone: string, url: string) => {
      whatsAppSent.push({ phone, url });
    }),
    auditWriter: {
      log: vi.fn(async (entry: { action: string; output?: unknown }) => {
        auditLog.push({ action: entry.action, output: (entry.output ?? {}) as Record<string, unknown> });
      }),
    },
    prisma: buildMockPrisma({
      endereco:        "Rua das Flores, 123, Cidade-X/SP",
      uf:              "SP",
      modalidade:      "DEAL_TYPE_A",
      property_id:     "PROP-SP-001",
      phase_tax_ref:   "TAX-REF-2025-001",
      title_status:    "REGULAR",
      valorAvaliacao:  250000,
      valorTotal:      275000,
      paymentDeadline: new Date(Date.now() + 6 * 86_400_000).toISOString(), // 6 dias
    }),
    ...overrides,
  };
}

function buildPayload(): RelatorioPayload {
  return { dealId: "deal-001", workspaceId: "ws-001" };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _id = 0;
  createdDocs  = [];
  updatedDocs  = [];
  whatsAppSent = [];
  auditLog     = [];
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("Agente: Relatório de Análise do Deal", () => {

  // ── T1: Geração completa ────────────────────────────────────────────────────
  it("T1: geração completa → Document criado, WhatsApp enviado, AuditLog registrado", async () => {
    const deps   = buildDeps();
    const result = await generateRelatorioImovel(buildPayload(), deps);

    // Result válido
    expect(result.documentId).toBeTruthy();
    expect(result.pdfUrl).toBe("https://minio.test/presigned-url");
    expect(result.report.resumo).toBeTruthy();

    // Upload foi chamado com a chave correta
    const uploadCall = vi.mocked(deps.uploadBuffer).mock.calls[0];
    expect(uploadCall?.[0]).toMatch(/ws-001\/deal-001\/relatorio-analise-\d{8}\.pdf/);
    expect(uploadCall?.[2]).toBe("application/pdf");

    // Document criado no banco
    expect(createdDocs).toHaveLength(1);
    const docData = createdDocs[0]!.data;
    expect(docData["name"]).toBe("Relatório de Análise do Deal");
    expect(docData["collection"]).toBe("deal_docs");
    expect(docData["dealId"]).toBe("deal-001");

    // pgvector upsert para past_interactions
    expect(vi.mocked(deps.vectorSearch.upsert)).toHaveBeenCalledWith(
      "past_interactions",
      expect.objectContaining({ id: "report:deal-001" }),
    );

    // WhatsApp enviado
    expect(whatsAppSent).toHaveLength(1);
    expect(whatsAppSent[0]?.phone).toBe("11999990001");

    // AuditLog registrado
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0]?.action).toBe("generate_relatorio");
    expect(auditLog[0]?.output["documentId"]).toBe(result.documentId);
  });

  // ── T2: title_status=EM_TRATAMENTO → bloqueante ────────────────────────────
  it("T2: title_status=EM_TRATAMENTO → Claude deve retornar status bloqueante", async () => {
    const blockanteReport = makeValidReport({
      titleStatus: {
        status:   "bloqueante",
        mensagem: "O title_status está em tratamento. Isso impede a transferência do deal_item. Aguarde resolução antes de prosseguir.",
      },
      riscos: [
        {
          titulo:    "title_status Em Tratamento",
          descricao: "O deal_item possui title_status em tratamento, o que pode bloquear a transferência de titularidade.",
          nivel:     "alto",
        },
      ],
    });

    const deps = buildDeps({
      callClaude:   vi.fn(async () => blockanteReport),
      callFallback: vi.fn(async () => blockanteReport),
      prisma:       buildMockPrisma({
        endereco:        "Rua Central, 321, Cidade-Y/RJ",
        uf:              "RJ",
        title_status:    "EM_TRATAMENTO",
        modalidade:      "DEAL_TYPE_B",
        paymentDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      }),
    });

    const result = await generateRelatorioImovel(buildPayload(), deps);

    expect(result.report.titleStatus.status).toBe("bloqueante");
    expect(result.report.titleStatus.mensagem).toContain("title_status");
    expect(result.report.riscos.some(r => r.nivel === "alto")).toBe(true);
  });

  // ── T3: Falha no MinIO → Document não criado, WA não enviado ──────────────
  it("T3: falha no MinIO → lança erro, Document não criado, WhatsApp não enviado", async () => {
    const deps = buildDeps({
      uploadBuffer: vi.fn(async () => {
        throw new Error("MinIO connection refused");
      }),
    });

    await expect(generateRelatorioImovel(buildPayload(), deps)).rejects.toThrow(
      "MinIO connection refused",
    );

    // Document NÃO foi criado
    expect(createdDocs).toHaveLength(0);

    // WhatsApp NÃO foi enviado
    expect(whatsAppSent).toHaveLength(0);
  });

  // ── T4: Claude falha → retry com gpt-4o-mini ──────────────────────────────
  it("T4: Claude lança erro → chama fallback (gpt-4o-mini) → sucesso", async () => {
    const fallbackReport = makeValidReport({
      resumo: "Relatório gerado pelo modelo de fallback (gpt-4o-mini).",
    });

    const mockClaude   = vi.fn(async () => { throw new Error("Claude API overloaded"); });
    const mockFallback = vi.fn(async () => fallbackReport);

    const deps = buildDeps({
      callClaude:   mockClaude,
      callFallback: mockFallback,
    });

    const result = await generateRelatorioImovel(buildPayload(), deps);

    // Claude foi chamado 1x
    expect(mockClaude).toHaveBeenCalledTimes(1);
    // Fallback foi chamado 1x
    expect(mockFallback).toHaveBeenCalledTimes(1);
    // Resultado veio do fallback
    expect(result.report.resumo).toContain("fallback");

    // Geração continuou normalmente
    expect(createdDocs).toHaveLength(1);
    expect(whatsAppSent).toHaveLength(1);
  });

  // ── T4b: Claude E fallback falham → lança erro combinado ──────────────────
  it("T4b: Claude + fallback falham → lança erro descritivo", async () => {
    const deps = buildDeps({
      callClaude:   vi.fn(async () => { throw new Error("Claude down"); }),
      callFallback: vi.fn(async () => { throw new Error("GPT also down"); }),
    });

    await expect(generateRelatorioImovel(buildPayload(), deps)).rejects.toThrow(
      /LLM falhou em ambas as tentativas/,
    );
  });

  // ── T5: URL presigned prestes a vencer → regenerar antes do WhatsApp ───────
  it("T5: document.expiresAt em 30min (< 1h) → getPresignedUrl chamado 2x + WhatsApp com URL renovada", async () => {
    // Simula documento cujo TTL expira em 30 min (< threshold de 1h)
    const expiringSoon = new Date(Date.now() + 30 * 60 * 1000);

    const mockGetPresigned = vi.fn()
      .mockResolvedValueOnce("https://minio.test/original-url")  // 1ª chamada: upload
      .mockResolvedValueOnce("https://minio.test/renewed-url");   // 2ª chamada: refresh

    // Mock prisma: document.create retorna expiresAt = expiringSoon
    const dealMeta = {
      endereco:        "Rua X, Cidade-X/SP",
      uf:              "SP",
      title_status:    "REGULAR",
      modalidade:      "DEAL_TYPE_A",
      paymentDeadline: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      valorAvaliacao:  250000,
      valorTotal:      275000,
    };
    const prismaExpiring = buildMockPrisma(dealMeta);
    // Sobrescreve document.create para devolver expiresAt prestes a vencer
    prismaExpiring.document.create = vi.fn(async (args: { data: Record<string, unknown> }) => {
      const doc = { id: nextId(), ...args.data, expiresAt: expiringSoon };
      createdDocs.push({ data: args.data });
      return doc;
    }) as typeof prismaExpiring.document.create;
    // [MULTI-TENANT] freshPresignedUrl usa findFirst; mock correspondente
    prismaExpiring.document.findFirst = vi.fn(async () => ({
      id:  "doc-mock",
      url: "https://minio.test/original-url",
    })) as typeof prismaExpiring.document.findFirst;
    // update registra a nova URL
    prismaExpiring.document.update = vi.fn(async (args: { data: Record<string, unknown> }) => {
      updatedDocs.push(args.data);
      return { id: "doc-mock", url: args.data["url"] as string };
    }) as typeof prismaExpiring.document.update;

    const deps = buildDeps({
      getPresignedUrl: mockGetPresigned,
      prisma:          prismaExpiring,
    });

    await generateRelatorioImovel(buildPayload(), deps);

    // getPresignedUrl deve ter sido chamado 2x: 1x para o upload + 1x para refresh
    expect(mockGetPresigned).toHaveBeenCalledTimes(2);

    // document.update foi chamado com a URL renovada
    expect(updatedDocs).toHaveLength(1);
    expect(updatedDocs[0]?.["url"]).toBe("https://minio.test/renewed-url");

    // WhatsApp enviado com a URL renovada
    expect(whatsAppSent).toHaveLength(1);
    expect(whatsAppSent[0]?.url).toBe("https://minio.test/renewed-url");
  });

  // ── EXTRA: Zod schema valida corretamente ───────────────────────────────────
  it("ReportAnaliseSchema rejeita output malformado do LLM", () => {
    const bad = {
      resumo:      "ok",
      titleStatus: { status: "INVALIDO", mensagem: "msg" }, // status inválido
      riscos:          [],
      proximosPassos:  [],
      prazosCriticos:  { paymentDeadline: "b", processo: "p" },
    };
    expect(() => ReportAnaliseSchema.parse(bad)).toThrow();
  });
});
