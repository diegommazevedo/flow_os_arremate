import OpenAI from "openai";
import { z } from "zod";
import type { AgentId, WorkspaceId } from "@flow-os/core";
import { BudgetExceededError, defaultSanitizer } from "@flow-os/core";
import { calculateCost, MODEL_CONFIGS, selectModel } from "./models";
import type { BrainModel } from "./models";

// ─── AgentRuntime ─────────────────────────────────────────────────────────────

export interface AgentSkill {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: unknown, ctx: AgentRunContext) => Promise<unknown>;
}

export interface AgentRunContext {
  workspaceId: WorkspaceId;
  agentId: AgentId;
  userId?: string;
  dealId?: string;
}

export interface AgentRunInput {
  input: string;
  systemPrompt?: string;
  context?: Record<string, unknown>;
  memories?: string[];      // fragmentos de BrainMemory relevantes
  requireApproval?: boolean; // SEC: human-in-the-loop
}

export interface AgentRunResult {
  content: string;
  toolCalls: ToolCallRecord[];
  model: BrainModel;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
}

export interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
  success: boolean;
  error?: string;
}

export interface AgentBudget {
  monthlyLimitUsd: number;
  usedUsd: number;
}

export class AgentRuntime {
  private openai: OpenAI;
  private skills = new Map<string, AgentSkill>();

  constructor(apiKey: string, private localBaseUrl?: string) {
    this.openai = new OpenAI({ apiKey });
  }

  registerSkill(skill: AgentSkill): void {
    this.skills.set(skill.name, skill);
  }

  async run(
    input: AgentRunInput,
    ctx: AgentRunContext,
    budget: AgentBudget,
    agentSkills: string[],
    persona: string,
  ): Promise<AgentRunResult> {
    // [SEC-07] Verificação de orçamento
    if (budget.usedUsd >= budget.monthlyLimitUsd) {
      throw new BudgetExceededError(ctx.agentId);
    }

    const start = Date.now();

    // [SEC-08] Sanitização de prompt — usa InputSanitizer do núcleo
    const sanitizeResult = defaultSanitizer.sanitize(input.input);
    const sanitizedInput = sanitizeResult.sanitized;
    if (sanitizeResult.blocked.length > 0) {
      // log de segurança sem PII — apenas metadados
      console.warn("[SEC-08] Prompt sanitizado", {
        agentId: ctx.agentId,
        workspaceId: ctx.workspaceId,
        blockedCount: sanitizeResult.blocked.length,
        warnings: sanitizeResult.warnings,
      });
    }

    // Selecionar modelo da cascata
    const model = selectModel({
      hasFineTunedModel: !!process.env["BRAIN_MODEL_FINETUNE"],
      hasLocalModel: !!this.localBaseUrl,
      complexity: estimateComplexity(sanitizedInput),
    });

    const modelConfig = MODEL_CONFIGS[model];

    // Construir tools disponíveis para este agente
    const tools = agentSkills
      .map((name) => this.skills.get(name))
      .filter((s): s is AgentSkill => s !== undefined)
      .map((skill) => skillToOpenAITool(skill));

    // Construir mensagens
    const systemContent = buildSystemPrompt(persona, input.memories ?? [], input.context ?? {});
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: sanitizedInput },
    ];

    // Executar via OpenAI (ou local via base URL compatível)
    const client =
      model === "local" && this.localBaseUrl
        ? new OpenAI({ apiKey: "local", baseURL: this.localBaseUrl })
        : this.openai;

    const completion = await client.chat.completions.create({
      model: modelConfig.apiId,
      messages,
      max_tokens: 2048,
      ...(tools.length > 0
        ? { tools, tool_choice: "auto" as const }
        : {}),
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("Nenhuma resposta do modelo");
    }

    const toolCalls: ToolCallRecord[] = [];

    // Processar tool-calls
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        const skill = this.skills.get(tc.function.name);
        if (!skill) continue;

        let toolOutput: unknown;
        let success = true;
        let error: string | undefined;

        try {
          const params = JSON.parse(tc.function.arguments) as unknown;
          const validated = skill.parameters.parse(params);
          toolOutput = await skill.execute(validated, ctx);
        } catch (err) {
          success = false;
          error = err instanceof Error ? err.message : String(err);
          toolOutput = null;
        }

        toolCalls.push({
          tool:   tc.function.name,
          input:  tc.function.arguments,
          output: toolOutput,
          success,
          ...(error ? { error } : {}),
        });
      }
    }

    const tokensUsed = completion.usage?.total_tokens ?? 0;
    const costUsd = calculateCost(tokensUsed, model);

    return {
      content: choice.message.content ?? "",
      toolCalls,
      model,
      tokensUsed,
      costUsd,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateComplexity(input: string): "low" | "medium" | "high" {
  if (input.length > 2000) return "high";
  if (input.length > 500) return "medium";
  return "low";
}

function buildSystemPrompt(
  persona: string,
  memories: string[],
  context: Record<string, unknown>,
): string {
  const memorySection =
    memories.length > 0
      ? `\n\nCONHECIMENTO RELEVANTE:\n${memories.slice(0, 10).join("\n")}`
      : "";

  const contextSection =
    Object.keys(context).length > 0
      ? `\n\nCONTEXTO ATUAL:\n${JSON.stringify(context, null, 2)}`
      : "";

  return `${persona}${memorySection}${contextSection}

REGRAS:
- Responda sempre em português do Brasil.
- Seja objetivo e preciso.
- Ao executar ações, confirme o que foi feito.
- Jamais invente dados — se não souber, diga que não sabe.`;
}

function skillToOpenAITool(skill: AgentSkill): OpenAI.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: skill.name,
      description: skill.description,
      parameters: zodToJsonSchema(skill.parameters),
    },
  };
}

function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  // Implementação simplificada — em produção usar zod-to-json-schema
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodFieldToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return { type: "object", properties, required };
  }
  return { type: "object" };
}

function zodFieldToJsonSchema(field: z.ZodTypeAny): Record<string, unknown> {
  if (field instanceof z.ZodString) return { type: "string" };
  if (field instanceof z.ZodNumber) return { type: "number" };
  if (field instanceof z.ZodBoolean) return { type: "boolean" };
  if (field instanceof z.ZodOptional) return zodFieldToJsonSchema(field.unwrap());
  if (field instanceof z.ZodEnum) return { type: "string", enum: field.options };
  return { type: "string" };
}
