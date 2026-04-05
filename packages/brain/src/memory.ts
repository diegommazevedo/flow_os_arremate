import type { AgentId, WorkspaceId } from "@flow-os/core";

// ─── Brain Memory Manager ─────────────────────────────────────────────────────

export interface MemoryFragment {
  id: string;
  content: string;
  relevance: number;
  source: "interaction" | "pattern" | "manual";
  expiresAt: Date;
  createdAt: Date;
}

export interface MemorySearchResult {
  fragment: MemoryFragment;
  score: number; // cosine similarity 0-1
}

/**
 * Gerenciador de memória do Brain IA.
 * Em produção usa pgvector para busca semântica;
 * em desenvolvimento usa busca por keyword simples.
 */
export class BrainMemoryManager {
  constructor(
    private readonly dbUrl: string,
    private readonly openaiApiKey: string,
  ) {}

  /**
   * Grava um novo fragmento de memória após interação bem-sucedida.
   * TTL padrão: 90 dias (configurável via BRAIN_MEMORY_TTL_DAYS).
   */
  async write(opts: {
    workspaceId: WorkspaceId;
    agentId: AgentId;
    content: string;
    source: MemoryFragment["source"];
    relevance?: number;
  }): Promise<string> {
    const ttlDays = parseInt(process.env["BRAIN_MEMORY_TTL_DAYS"] ?? "90", 10);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    // Embedding gerado via OpenAI text-embedding-3-small
    // Em produção: await this.generateEmbedding(opts.content)
    // Por ora: placeholder para o schema
    const id = crypto.randomUUID();

    // Aqui chamaria db.brainMemory.create(...)
    // Separado do pacote para evitar dependência circular
    return id;
  }

  /**
   * Busca fragmentos relevantes por similaridade semântica.
   * Retorna os top-K fragmentos mais próximos do query.
   */
  async search(opts: {
    workspaceId: WorkspaceId;
    agentId: AgentId;
    query: string;
    topK?: number;
  }): Promise<MemorySearchResult[]> {
    const k = opts.topK ?? 5;
    // Em produção: pgvector SELECT ... ORDER BY embedding <=> $queryEmbedding LIMIT k
    // Aqui retorna placeholder
    void k;
    return [];
  }

  /**
   * Remove fragmentos expirados (job diário).
   */
  async pruneExpired(workspaceId: WorkspaceId): Promise<number> {
    // db.brainMemory.deleteMany({ where: { workspaceId, expiresAt: { lt: new Date() } } })
    void workspaceId;
    return 0;
  }

  /**
   * Extrai padrões repetidos das memórias e sugere FlowTemplates.
   * Roda mensalmente para alimentar o ciclo de fine-tune.
   */
  async extractPatterns(workspaceId: WorkspaceId): Promise<PatternExtractionResult[]> {
    void workspaceId;
    return [];
  }
}

export interface PatternExtractionResult {
  pattern: string;
  frequency: number;
  suggestedFlowName: string;
  suggestedActions: string[];
}

// ─── Usage Monitor ────────────────────────────────────────────────────────────

export interface BrainUsageMetrics {
  workspaceId: string;
  month: string;
  totalTokensUsed: number;
  totalCostUsd: number;
  usedBudgetPercent: number;
  memoryCacheHitRate: number;
  modelBreakdown: Record<string, { tokens: number; costUsd: number }>;
  projectedMonthlyUsd: number;
  estimatedLocalMigrationDate: Date | null;
}

export class BrainMonitor {
  /**
   * Calcula projeção de migração para modelo local.
   * Baseado na taxa de acumulação de memórias e disponibilidade de fine-tune.
   */
  estimateLocalMigrationDate(
    monthlyGrowthRate: number, // % de crescimento de memórias/mês
    currentMemoryCount: number,
    targetMemoryForFineTune = 500,
  ): Date | null {
    if (currentMemoryCount >= targetMemoryForFineTune) {
      return new Date(); // já pode migrar
    }

    if (monthlyGrowthRate <= 0) return null;

    const monthsNeeded = Math.ceil(
      (targetMemoryForFineTune - currentMemoryCount) /
        (currentMemoryCount * (monthlyGrowthRate / 100)),
    );

    const date = new Date();
    date.setMonth(date.getMonth() + monthsNeeded);
    return date;
  }
}
