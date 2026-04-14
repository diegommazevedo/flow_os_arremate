/**
 * Field Workflow Resolver — busca workflow ativo no DB com cache TTL
 *
 * Se não houver workflow no banco, retorna os defaults hardcoded.
 * Cache in-memory de 5 minutos evita query a cada dispatch.
 */

import { db } from "@flow-os/db";
import {
  DEFAULT_MSG1_TEMPLATE,
  DEFAULT_MSG2_TEMPLATE,
  DEFAULT_MSG3_TEMPLATE,
  DEFAULT_WORKFLOW_CONFIG,
} from "./field-agent-defaults";

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface ResolvedWorkflowConfig {
  agentLimit: number;
  followupDelayMs: number;
  deadlineHours: number;
  priceDefault: number;
  currency: string;
  evidenceTypes: string[];
  evidenceMinimum: number;
  autoRetry: boolean;
}

export interface ResolvedWorkflow {
  id: string | null; // null = usando defaults
  name: string;
  config: ResolvedWorkflowConfig;
  templates: Record<string, string>; // key do step → body do template
}

// ── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: ResolvedWorkflow;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const cache = new Map<string, CacheEntry>();

export function clearWorkflowCache(workspaceId?: string): void {
  if (workspaceId) {
    cache.delete(workspaceId);
  } else {
    cache.clear();
  }
}

// ── Default fallback ──────────────────────────────────────────────────────

function buildDefaultWorkflow(): ResolvedWorkflow {
  const base = DEFAULT_WORKFLOW_CONFIG;
  return {
    id: null,
    name: "Workflow Padrão (hardcoded)",
    config: {
      agentLimit: base.agentLimit,
      followupDelayMs: base.followupDelayMs,
      deadlineHours: base.deadlineHours,
      priceDefault: base.priceDefault,
      currency: base.currency,
      evidenceTypes: [...base.evidenceTypes],
      evidenceMinimum: base.evidenceMinimum,
      autoRetry: base.autoRetry,
    },
    templates: {
      initial_contact: DEFAULT_MSG1_TEMPLATE,
      send_details: DEFAULT_MSG2_TEMPLATE,
      send_confirmation: DEFAULT_MSG3_TEMPLATE,
    },
  };
}

// ── Resolver ──────────────────────────────────────────────────────────────

export async function resolveWorkflow(
  workspaceId: string,
): Promise<ResolvedWorkflow> {
  // 1. Checar cache
  const cached = cache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // 2. Buscar no banco
  try {
    const workflow = await db.fieldWorkflow.findFirst({
      where: { workspaceId, isActive: true },
      include: {
        steps: {
          include: { template: true },
          orderBy: { position: "asc" },
        },
        config: true,
      },
    });

    if (!workflow) {
      const fallback = buildDefaultWorkflow();
      cache.set(workspaceId, { data: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }

    // 3. Montar templates (key → body)
    const templates: Record<string, string> = {};
    for (const step of workflow.steps) {
      if (step.template) {
        templates[step.key] = step.template.body;
      }
    }

    // Fallback para templates ausentes
    if (!templates["initial_contact"]) templates["initial_contact"] = DEFAULT_MSG1_TEMPLATE;
    if (!templates["send_details"]) templates["send_details"] = DEFAULT_MSG2_TEMPLATE;
    if (!templates["send_confirmation"]) templates["send_confirmation"] = DEFAULT_MSG3_TEMPLATE;

    // 4. Montar config
    const cfg = workflow.config;
    const config: ResolvedWorkflowConfig = {
      agentLimit: cfg?.agentLimit ?? DEFAULT_WORKFLOW_CONFIG.agentLimit,
      followupDelayMs: cfg?.followupDelayMs ?? DEFAULT_WORKFLOW_CONFIG.followupDelayMs,
      deadlineHours: cfg?.deadlineHours ?? DEFAULT_WORKFLOW_CONFIG.deadlineHours,
      priceDefault: cfg?.priceDefault ? Number(cfg.priceDefault) : DEFAULT_WORKFLOW_CONFIG.priceDefault,
      currency: cfg?.currency ?? DEFAULT_WORKFLOW_CONFIG.currency,
      evidenceTypes: (cfg?.evidenceTypes as string[] | undefined) ?? [...DEFAULT_WORKFLOW_CONFIG.evidenceTypes],
      evidenceMinimum: cfg?.evidenceMinimum ?? DEFAULT_WORKFLOW_CONFIG.evidenceMinimum,
      autoRetry: cfg?.autoRetry ?? DEFAULT_WORKFLOW_CONFIG.autoRetry,
    };

    const resolved: ResolvedWorkflow = {
      id: workflow.id,
      name: workflow.name,
      config,
      templates,
    };

    cache.set(workspaceId, { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolved;
  } catch (err) {
    // DB falhou — retorna defaults sem cache (para tentar de novo na próxima)
    console.warn("[field-workflow-resolver] Falha ao buscar workflow, usando defaults:", err);
    return buildDefaultWorkflow();
  }
}
