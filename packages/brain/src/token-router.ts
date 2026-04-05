/**
 * FlowOS v4 — TokenRouter
 * Pipeline completo: sanitize → cache → pgvector → hard rules → provider cascade → LLM → memory → audit
 *
 * Cascade padrão: Ollama → Groq → FineTuned → OpenAI → Claude Sonnet
 */

import crypto from "node:crypto";
import { z } from "zod";
import { defaultSanitizer } from "@flow-os/core";

// ─── Provider names ────────────────────────────────────────────────────────────

export type ProviderName =
  | "ollama"       // Local Ollama — $0.01/1M, cold start alto
  | "groq"         // Groq API    — $0.08/1M, ~200ms latência
  | "fine-tuned"   // OpenAI FT   — $0.08/1M, especializado no negócio
  | "openai"       // GPT-4o      — $2.50/1M, fallback robusto
  | "claude";      // Claude 3.5  — $3.00/1M, fallback final

/** Custo por 1M tokens de cada provider (USD) */
export const PROVIDER_COSTS: Record<ProviderName, number> = {
  ollama:      0.01,
  groq:        0.08,
  "fine-tuned": 0.08,
  openai:      2.50,
  claude:      3.00,
};

// ─── RouterDecision schema (structured output do LLM) ─────────────────────────

export const RouterDecisionSchema = z.object({
  /** Quadrante Eisenhower determinado pelo router */
  quadrant: z.enum(["Q1_DO", "Q2_PLAN", "Q3_DELEGATE", "Q4_ELIMINATE"]),
  /** ISO 8601 — prazo máximo de SLA */
  slaDeadline: z.string().datetime(),
  /** Provider que gerou esta decisão */
  provider: z.enum(["ollama", "groq", "fine-tuned", "openai", "claude"]),
  /** Explicação humana da decisão */
  reason: z.string().min(1).max(500),
  /** Confiança do router: 0.0 – 1.0 */
  confidence: z.number().min(0).max(1),
  /** Próxima ação recomendada para o agente executor */
  suggestedAction: z.string().min(1).max(300),
  /** Fatores que contribuíram para a urgência */
  urgencyFactors: z.array(z.string()),
  /** Tempo estimado de resposta ao ator externo (ms) */
  estimatedResponseTimeMs: z.number().int().positive(),
});

export type RouterDecision = z.infer<typeof RouterDecisionSchema>;

// ─── Token usage ───────────────────────────────────────────────────────────────

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  costUsd: number;
}

// ─── Interfaces injetáveis (testáveis sem infra real) ─────────────────────────

export interface VectorChunk {
  id: string;
  content: string;
  score: number;                              // cosine similarity 0–1
  collection: "faq" | "past_interactions";
  metadata?: Record<string, unknown>;
}

export interface VectorContext {
  chunks: VectorChunk[];
  maxScore: number;
  avgScore: number;
}

export interface HardRuleResult {
  triggered: boolean;
  rule?: string;
  forcedQuadrant?: RouterDecision["quadrant"];
  slaDeadlineOverride?: Date;
  reason?: string;
}

export interface LLMProvider {
  readonly name: ProviderName;
  isAvailable(): Promise<boolean>;
  complete(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<RouterDecision>,
  ): Promise<{ decision: RouterDecision; usage: TokenUsage }>;
}

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface VectorSearchClient {
  search(
    query: string,
    collections: string[],
    workspaceId: string,
    topK: number,
  ): Promise<VectorChunk[]>;
  upsert(
    collection: string,
    content: string,
    metadata: Record<string, unknown>,
    workspaceId: string,
  ): Promise<void>;
}

export interface MemoryWriter {
  write(opts: {
    workspaceId: string;
    agentId: string;
    content: string;
    source: "interaction" | "pattern" | "manual";
  }): Promise<string>;
}

export interface AuditWriter {
  write(opts: {
    workspaceId: string;
    agentId: string;
    action: string;
    input: unknown;
    output: unknown;
    modelUsed: string;
    tokensUsed: number;
    costUsd: number;
    durationMs: number;
    success: boolean;
    error?: string;
  }): Promise<void>;
  log(opts: {
    action: string;
    input: unknown;
    output: unknown;
    success: boolean;
    durationMs: number;
    severity: string;
  }): Promise<void>;
}

// ─── TokenRouter input / output ────────────────────────────────────────────────

export interface TokenRouterInput {
  /** Mensagem bruta recebida (WhatsApp, web, API) */
  message: string;
  workspaceId: string;
  agentId: string;
  /** Template ativo — define hard rules e provider preference */
  templateId: string;
  channel?: "whatsapp" | "web" | "api" | "sms";
  userId?: string;
  dealId?: string;
  /** Hints de contexto — ex: { hoursUntilDeadline: 24 } */
  contextHints?: Record<string, unknown>;
}

export interface TokenRouterResult {
  decision: RouterDecision;
  usage: TokenUsage;
  cacheHit: boolean;
  vectorContext: VectorContext;
  durationMs: number;
  sanitizeWarnings: string[];
}

export interface TokenRouterConfig {
  cacheTtlSeconds?: number;          // default: 1800 (30 min)
  vectorTopK?: number;               // default: 5
  /** vectorScore acima deste threshold → Ollama (RAG confiante) */
  vectorScoreThreshold?: number;     // default: 0.92
  maxFallbackAttempts?: number;      // default: 3
  logToConsole?: boolean;            // default: true em dev/test
}

// ─── TokenRouter ───────────────────────────────────────────────────────────────

export class TokenRouter {
  private readonly cfg: Required<TokenRouterConfig>;

  constructor(
    private readonly providers: LLMProvider[],
    private readonly cache: CacheClient,
    private readonly vectorSearch: VectorSearchClient,
    private readonly memoryWriter: MemoryWriter,
    private readonly auditWriter: AuditWriter,
    config: TokenRouterConfig = {},
  ) {
    this.cfg = {
      cacheTtlSeconds:       config.cacheTtlSeconds       ?? 1800,
      vectorTopK:            config.vectorTopK            ?? 5,
      vectorScoreThreshold:  config.vectorScoreThreshold  ?? 0.92,
      maxFallbackAttempts:   config.maxFallbackAttempts   ?? 3,
      logToConsole:          config.logToConsole          ?? true,
    };
  }

  // ── Ponto de entrada ─────────────────────────────────────────────────────────

  async route(input: TokenRouterInput): Promise<TokenRouterResult> {
    const start = Date.now();

    // ── Step 1: Sanitize [SEC-08] ─────────────────────────────────────────────
    const sanitizeResult = defaultSanitizer.sanitize(input.message);
    const cleanMessage   = sanitizeResult.sanitized;

    if (sanitizeResult.blocked.length > 0) {
      this.log("[SEC-08] Input sanitizado", {
        blockedPatterns: sanitizeResult.blocked.map(b => b.pattern),
        warnings:        sanitizeResult.warnings,
      });
    }

    // ── Step 2: Cache Redis ────────────────────────────────────────────────────
    const cacheKey = this.buildCacheKey(cleanMessage, input.workspaceId, input.templateId);
    const cached   = await this.cache.get(cacheKey);

    if (cached) {
      const decision    = RouterDecisionSchema.parse(JSON.parse(cached) as unknown);
      const durationMs  = Date.now() - start;
      this.printDecision(decision, { durationMs, cacheHit: true, usage: zero() });
      return {
        decision,
        usage:            zero(),
        cacheHit:         true,
        vectorContext:    empty(),
        durationMs,
        sanitizeWarnings: sanitizeResult.warnings,
      };
    }

    // ── Step 3: pgvector context ───────────────────────────────────────────────
    const vectorContext = await this.searchVector(
      cleanMessage,
      input.workspaceId,
      ["faq", "past_interactions"],
    );

    // ── Step 4: Hard rules (template-specific) ────────────────────────────────
    const hardRule = this.applyHardRules(input, vectorContext);

    // ── Step 5: Provider selection ────────────────────────────────────────────
    const preferredProvider = this.selectProvider(
      vectorContext.maxScore,
      hardRule,
      input.templateId,
    );

    // ── Step 6: LLM call com structured output ────────────────────────────────
    const systemPrompt = this.buildSystemPrompt(input.templateId, vectorContext, hardRule);
    const userPrompt   = this.buildUserPrompt(cleanMessage, input);

    const { decision: rawDecision, usage } = await this.callWithFallback(
      preferredProvider,
      systemPrompt,
      userPrompt,
    );

    // Aplicar overrides non-negotiable das hard rules
    const finalDecision = this.applyOverrides(rawDecision, hardRule);

    // ── Step 7: MemoryEngine + AuditLog ──────────────────────────────────────
    const durationMs = Date.now() - start;

    await Promise.all([
      this.memoryWriter.write({
        workspaceId: input.workspaceId,
        agentId:     input.agentId,
        content:     `[${input.templateId}] "${cleanMessage.slice(0, 200)}" → ${finalDecision.quadrant} via ${finalDecision.provider} (conf: ${finalDecision.confidence})`,
        source:      "interaction",
      }),
      this.auditWriter.write({
        workspaceId: input.workspaceId,
        agentId:     input.agentId,
        action:      "token-router.route",
        input: {
          message:    cleanMessage.slice(0, 500),
          templateId: input.templateId,
          channel:    input.channel,
          cacheKey,
        },
        output:      finalDecision,
        modelUsed:   finalDecision.provider,
        tokensUsed:  usage.total,
        costUsd:     usage.costUsd,
        durationMs,
        success:     true,
      }),
    ]);

    // Cachear decisão final
    await this.cache.set(cacheKey, JSON.stringify(finalDecision), this.cfg.cacheTtlSeconds);

    this.printDecision(finalDecision, { durationMs, cacheHit: false, usage });

    return {
      decision:         finalDecision,
      usage,
      cacheHit:         false,
      vectorContext,
      durationMs,
      sanitizeWarnings: sanitizeResult.warnings,
    };
  }

  // ── Pipeline steps (privados) ────────────────────────────────────────────────

  private buildCacheKey(
    message: string,
    workspaceId: string,
    templateId: string,
  ): string {
    const hash = crypto
      .createHash("sha256")
      .update(`${workspaceId}:${templateId}:${message.toLowerCase().trim()}`)
      .digest("hex")
      .slice(0, 16);
    return `flowos:router:${hash}`;
  }

  private async searchVector(
    query: string,
    workspaceId: string,
    collections: string[],
  ): Promise<VectorContext> {
    const chunks = await this.vectorSearch.search(
      query,
      collections,
      workspaceId,
      this.cfg.vectorTopK,
    );
    if (chunks.length === 0) return empty();

    const scores  = chunks.map(c => c.score);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { chunks, maxScore, avgScore };
  }

  /**
   * Hard rules genéricas baseadas em deadline e palavras-chave de urgência.
   * Regra central: hoursUntilDeadline < 48 → Q1 obrigatório.
   * Templates passam contexto via contextHints.hoursUntilDeadline.
   */
  private applyHardRules(
    input: TokenRouterInput,
    _ctx: VectorContext,
  ): HardRuleResult {
    const hours = this.extractDeadlineHours(input.message, input.contextHints ?? {});

    if (hours !== null && hours < 48) {
      return {
        triggered:           true,
        rule:                "PAYMENT_DEADLINE_48H",
        forcedQuadrant:      "Q1_DO",
        slaDeadlineOverride: new Date(Date.now() + 60 * 60 * 1000), // +1h
        reason:              `payment_deadline em ${hours.toFixed(0)}h — triagem Q1 obrigatória, SLA +1h`,
      };
    }

    // Regra genérica por palavras-chave de urgência (qualquer template)
    const URGENCY_KW = [
      "vence amanhã", "vence hoje", "não consigo pagar",
      "bloqueado", "urgente", "prazo vencendo",
    ];
    const lower = input.message.toLowerCase();
    const matchedKw = URGENCY_KW.filter(kw => lower.includes(kw));

    if (matchedKw.length > 0) {
      return {
        triggered:           true,
        rule:                "URGENCY_KEYWORDS",
        forcedQuadrant:      "Q1_DO",
        slaDeadlineOverride: new Date(Date.now() + 2 * 60 * 60 * 1000), // +2h
        reason:              `Urgência detectada: [${matchedKw.join(", ")}]`,
      };
    }

    return { triggered: false };
  }

  /**
   * Extrai horas até o prazo a partir do texto em português e dos contextHints.
   * contextHints.hoursUntilDeadline tem precedência sobre parsing linguístico.
   */
  private extractDeadlineHours(
    message: string,
    hints: Record<string, unknown>,
  ): number | null {
    if (typeof hints["hoursUntilDeadline"] === "number") {
      return hints["hoursUntilDeadline"] as number;
    }
    const lower = message.toLowerCase();
    if (/amanhã|amanha/.test(lower))                     return 24;
    if (/hoje/.test(lower))                               return 4;
    if (/agora|imediatamente/.test(lower))               return 1;
    const dias  = lower.match(/(\d+)\s*dia/);
    if (dias?.[1])  return parseInt(dias[1]) * 24;
    const horas = lower.match(/(\d+)\s*hora/);
    if (horas?.[1]) return parseInt(horas[1]);
    return null;
  }

  /**
   * Seleciona o provider preferido:
   *   vectorScore > 0.92 → Ollama (RAG local confiante, sem custo de API)
   *   Q1 urgente         → Groq   (menor latência)
   *   template com FT    → fine-tuned
   *   default            → Groq
   */
  private selectProvider(
    vectorScore: number,
    hardRule: HardRuleResult,
    templateId: string,
  ): ProviderName {
    if (vectorScore >= this.cfg.vectorScoreThreshold) return "ollama";
    if (hardRule.triggered && hardRule.forcedQuadrant === "Q1_DO") return "groq";
    if (templateId && process.env["BRAIN_MODEL_FINETUNE"]) {
      return "fine-tuned";
    }
    return "groq";
  }

  /**
   * Cascata de fallback: tenta preferredProvider primeiro,
   * depois percorre o resto da cascade em ordem.
   */
  private async callWithFallback(
    preferred: ProviderName,
    system: string,
    user: string,
  ): Promise<{ decision: RouterDecision; usage: TokenUsage }> {
    const CASCADE: ProviderName[] = ["ollama", "groq", "fine-tuned", "openai", "claude"];

    // preferred primeiro, sem duplicatas
    const ordered = [
      preferred,
      ...CASCADE.filter(p => p !== preferred),
    ].slice(0, this.cfg.maxFallbackAttempts);

    let lastError: unknown;

    for (const name of ordered) {
      const provider = this.providers.find(p => p.name === name);
      if (!provider) continue;

      try {
        const available = await provider.isAvailable();
        if (!available) {
          this.log(`  [cascade] ${name} indisponível — próximo`);
          continue;
        }

        this.log(`  [cascade] chamando ${name}`);
        return await provider.complete(system, user, RouterDecisionSchema);
      } catch (err) {
        lastError = err;
        this.log(`  [cascade] ${name} falhou — fallback`, { err: String(err) });
      }
    }

    throw new Error(
      `[TokenRouter] Todos os providers falharam. Último: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  /** Aplica os overrides das hard rules (non-negotiable) */
  private applyOverrides(
    decision: RouterDecision,
    hard: HardRuleResult,
  ): RouterDecision {
    if (!hard.triggered) return decision;
    return {
      ...decision,
      quadrant:     hard.forcedQuadrant      ?? decision.quadrant,
      slaDeadline:  hard.slaDeadlineOverride?.toISOString() ?? decision.slaDeadline,
      reason:       `[HARD:${hard.rule}] ${hard.reason} | ${decision.reason}`,
      urgencyFactors: [
        ...(hard.rule ? [hard.rule] : []),
        ...decision.urgencyFactors,
      ],
    };
  }

  // ── Prompt builders ──────────────────────────────────────────────────────────

  private buildSystemPrompt(
    templateId: string,
    ctx: VectorContext,
    hard: HardRuleResult,
  ): string {
    const ctxSection = ctx.chunks.length > 0
      ? `\n\nCONHECIMENTO RELEVANTE (score máx ${ctx.maxScore.toFixed(3)}):\n${
          ctx.chunks
            .slice(0, 3)
            .map(c => `[${c.collection.toUpperCase()}] ${c.content.slice(0, 400)}`)
            .join("\n---\n")
        }`
      : "\n\n(Sem contexto RAG disponível — use conhecimento geral do template)";

    const hardSection = hard.triggered
      ? `\n\n⚠ HARD RULE ATIVA: ${hard.rule}\n${hard.reason}\nEste override é NON-NEGOTIABLE.`
      : "";

    return [
      `Você é o TokenRouter do FlowOS (template: ${templateId}).`,
      `Sua função é classificar mensagens de atores externos e decidir como priorizá-las.`,
      ``,
      `QUADRANTES EISENHOWER:`,
      `  Q1_DO       — urgente + importante  → resposta ≤1h (payment_deadline, bloqueio, prazo)`,
      `  Q2_PLAN     — importante, não urgente → agendar`,
      `  Q3_DELEGATE — urgente, rotineiro     → FAQ automático`,
      `  Q4_ELIMINATE — nem urgente nem importante`,
      ctxSection,
      hardSection,
      ``,
      `Responda EXCLUSIVAMENTE com JSON no schema RouterDecision. Sem texto extra.`,
    ].join("\n");
  }

  private buildUserPrompt(message: string, input: TokenRouterInput): string {
    return [
      `Canal: ${input.channel ?? "desconhecido"}`,
      `Mensagem do ator externo:`,
      `"${message}"`,
      ``,
      `Retorne o RouterDecision JSON completo.`,
    ].join("\n");
  }

  // ── Console output ───────────────────────────────────────────────────────────

  private printDecision(
    decision: RouterDecision,
    meta: { durationMs: number; cacheHit: boolean; usage: TokenUsage },
  ): void {
    if (!this.cfg.logToConsole) return;

    const line = "━".repeat(52);
    const slaDate = new Date(decision.slaDeadline);

    console.log(`\n${line}`);
    console.log("  FlowOS TokenRouter — Decisão Final");
    console.log(line);
    console.log(`  Provider     : ${decision.provider}${meta.cacheHit ? "  ✦ CACHE HIT" : ""}`);
    console.log(`  Motivo       : ${decision.reason.slice(0, 100)}`);

    if (!meta.cacheHit && meta.usage.total > 0) {
      console.log(`  Tokens       : ${meta.usage.input} in + ${meta.usage.output} out = ${meta.usage.total} total`);
      console.log(`  Custo        : $${meta.usage.costUsd.toFixed(6)}`);
    }

    console.log(`  Duração      : ${meta.durationMs}ms`);
    console.log(`  Quadrante    : ${decision.quadrant}`);
    console.log(
      `  SLA deadline : ${slaDate.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })}`,
    );
    console.log(`  Confiança    : ${(decision.confidence * 100).toFixed(0)}%`);
    console.log(`  Ação sugerida: ${decision.suggestedAction}`);

    if (decision.urgencyFactors.length > 0) {
      console.log(`  Fatores urgência: ${decision.urgencyFactors.join(", ")}`);
    }

    console.log(`\n  RouterDecision (JSON completo):`);
    console.log(JSON.stringify(decision, null, 4).split("\n").map(l => `  ${l}`).join("\n"));
    console.log(`${line}\n`);
  }

  private log(msg: string, data?: unknown): void {
    if (!this.cfg.logToConsole) return;
    if (data) console.log(`[TokenRouter] ${msg}`, data);
    else       console.log(`[TokenRouter] ${msg}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function zero(): TokenUsage {
  return { input: 0, output: 0, total: 0, costUsd: 0 };
}

function empty(): VectorContext {
  return { chunks: [], maxScore: 0, avgScore: 0 };
}
