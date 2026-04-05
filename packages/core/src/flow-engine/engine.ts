import type { Flow, FlowStep, WorkspaceId } from "../domain/types";
import { FlowOSError } from "../domain/types";

// ─── Motor de Fluxos ──────────────────────────────────────────────────────────

export type FlowEventPayload = Record<string, unknown>;

export interface FlowExecutionContext {
  workspaceId: WorkspaceId;
  flowId: string;
  eventId: string;
  payload: FlowEventPayload;
  variables: Record<string, unknown>;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output: unknown;
  skipped: boolean;
  error?: string;
}

export interface FlowExecutionResult {
  flowId: string;
  eventId: string;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  stepResults: StepResult[];
  durationMs: number;
  error?: string;
}

export type ActionHandler = (
  action: Record<string, unknown>,
  ctx: FlowExecutionContext,
) => Promise<unknown>;

export type ConditionEvaluator = (
  condition: Record<string, unknown>,
  ctx: FlowExecutionContext,
) => Promise<boolean>;

// ─── Evaluador de condições ───────────────────────────────────────────────────

/**
 * Avalia condições simples como:
 * { field: "deal.value", operator: ">", value: 50000 }
 */
export function evaluateSimpleCondition(
  condition: Record<string, unknown>,
  ctx: FlowExecutionContext,
): boolean {
  const { field, operator, value } = condition as {
    field: string;
    operator: string;
    value: unknown;
  };

  const fieldValue = resolveFieldPath(field, ctx);

  switch (operator) {
    case ">": return (fieldValue as number) > (value as number);
    case ">=": return (fieldValue as number) >= (value as number);
    case "<": return (fieldValue as number) < (value as number);
    case "<=": return (fieldValue as number) <= (value as number);
    case "==":
    case "===": return fieldValue === value;
    case "!=":
    case "!==": return fieldValue !== value;
    case "contains":
      return typeof fieldValue === "string" &&
        fieldValue.toLowerCase().includes(String(value).toLowerCase());
    case "in":
      return Array.isArray(value) && value.includes(fieldValue);
    default:
      throw new FlowOSError(`Operador desconhecido: ${operator}`, "UNKNOWN_OPERATOR");
  }
}

function resolveFieldPath(
  path: string,
  ctx: FlowExecutionContext,
): unknown {
  const parts = path.split(".");
  let current: unknown = { payload: ctx.payload, variables: ctx.variables };

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Executor principal ───────────────────────────────────────────────────────

export class FlowEngine {
  private actionHandlers = new Map<string, ActionHandler>();
  private conditionEvaluators = new Map<string, ConditionEvaluator>();

  registerAction(type: string, handler: ActionHandler): void {
    this.actionHandlers.set(type, handler);
  }

  registerConditionEvaluator(type: string, evaluator: ConditionEvaluator): void {
    this.conditionEvaluators.set(type, evaluator);
  }

  async execute(
    flow: Flow,
    payload: FlowEventPayload,
    eventId: string,
  ): Promise<FlowExecutionResult> {
    const start = Date.now();
    const ctx: FlowExecutionContext = {
      workspaceId: flow.workspaceId,
      flowId: flow.id,
      eventId,
      payload,
      variables: {},
    };

    const stepResults: StepResult[] = [];
    let shouldContinue = true;

    const sortedSteps = [...flow.steps].sort((a, b) => a.position - b.position);

    for (const step of sortedSteps) {
      if (!shouldContinue) {
        stepResults.push({
          stepId: step.id,
          success: true,
          output: null,
          skipped: true,
        });
        continue;
      }

      try {
        const result = await this.executeStep(step, ctx);
        stepResults.push({ stepId: step.id, ...result });

        if (step.type === "CONDITION" && !result.output) {
          shouldContinue = false;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        stepResults.push({
          stepId: step.id,
          success: false,
          output: null,
          skipped: false,
          error,
        });

        return {
          flowId: flow.id,
          eventId,
          status: "FAILED",
          stepResults,
          durationMs: Date.now() - start,
          error,
        };
      }
    }

    const hasFailures = stepResults.some((r) => !r.success && !r.skipped);
    return {
      flowId: flow.id,
      eventId,
      status: hasFailures ? "PARTIAL" : "COMPLETED",
      stepResults,
      durationMs: Date.now() - start,
    };
  }

  private async executeStep(
    step: FlowStep,
    ctx: FlowExecutionContext,
  ): Promise<Omit<StepResult, "stepId">> {
    if (step.type === "CONDITION" && step.condition) {
      const condType = (step.condition["type"] as string) ?? "simple";
      const evaluator = this.conditionEvaluators.get(condType);

      let result: boolean;
      if (evaluator) {
        result = await evaluator(step.condition, ctx);
      } else {
        result = evaluateSimpleCondition(step.condition, ctx);
      }

      return { success: true, output: result, skipped: false };
    }

    if (step.type === "ACTION" || step.type === "AGENT_CALL") {
      const actionType = step.action["type"] as string;
      const handler = this.actionHandlers.get(actionType);

      if (!handler) {
        throw new FlowOSError(
          `Action handler não registrado: ${actionType}`,
          "HANDLER_NOT_FOUND",
        );
      }

      const output = await handler(step.action, ctx);
      return { success: true, output, skipped: false };
    }

    if (step.type === "WAIT") {
      const delayMs = (step.action["delayMs"] as number) ?? 0;
      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 30000)));
      return { success: true, output: null, skipped: false };
    }

    return { success: true, output: null, skipped: true };
  }
}
