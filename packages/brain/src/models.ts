// ─── Cascata de modelos Brain IA ──────────────────────────────────────────────
// Progride automaticamente conforme custo acumulado e fine-tunes disponíveis.

export type BrainModel =
  | "gpt-4o-mini"        // Mês 1-2: gateway universal ($0.15/1M)
  | "gpt-4o"             // Mês 3-4: padrões complexos ($2.50/1M)
  | "fine-tuned"         // Mês 5-6: modelo treinado no negócio ($0.08/1M)
  | "local";             // Mês 7+: Ollama local (~$0.01/1M)

export interface ModelConfig {
  id: BrainModel;
  apiId: string;         // ID real enviado à API
  costPer1MTokens: number;
  maxTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

export const MODEL_CONFIGS: Record<BrainModel, ModelConfig> = {
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    apiId: process.env["BRAIN_MODEL_GATEWAY"] ?? "gpt-4o-mini",
    costPer1MTokens: 0.15,
    maxTokens: 128000,
    supportsTools: true,
    supportsVision: false,
  },
  "gpt-4o": {
    id: "gpt-4o",
    apiId: process.env["BRAIN_MODEL_PATTERN"] ?? "gpt-4o",
    costPer1MTokens: 2.50,
    maxTokens: 128000,
    supportsTools: true,
    supportsVision: true,
  },
  "fine-tuned": {
    id: "fine-tuned",
    apiId: process.env["BRAIN_MODEL_FINETUNE"] ?? "gpt-4o-mini",
    costPer1MTokens: 0.08,
    maxTokens: 128000,
    supportsTools: true,
    supportsVision: false,
  },
  "local": {
    id: "local",
    apiId: "llama3.2",
    costPer1MTokens: 0.01,
    maxTokens: 8192,
    supportsTools: false,
    supportsVision: false,
  },
};

/**
 * Seleciona o modelo mais econômico disponível para o workspace.
 * A cascata progride conforme dados de fine-tune e configuração local.
 */
export function selectModel(opts: {
  hasFineTunedModel: boolean;
  hasLocalModel: boolean;
  complexity: "low" | "medium" | "high";
}): BrainModel {
  if (opts.hasLocalModel && opts.complexity === "low") return "local";
  if (opts.hasFineTunedModel) return "fine-tuned";
  if (opts.complexity === "high") return "gpt-4o";
  return "gpt-4o-mini";
}

export function calculateCost(tokens: number, model: BrainModel): number {
  const config = MODEL_CONFIGS[model];
  return (tokens / 1_000_000) * config.costPer1MTokens;
}
