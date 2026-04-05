import { z } from "zod";
import type { SectorId } from "@flow-os/core";

// ─── Template Engine ──────────────────────────────────────────────────────────

export interface StageConfig {
  name: string;
  color: string;
  slaDays?: number;
  wipLimit?: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface UiVocabulary {
  deal: string;       // "Imóvel" | "Paciente" | "Processo" | "Obra" | "Reserva"
  contact: string;    // "Cliente" | "Responsável" | ...
  stage: string;      // "Etapa" | "Fase" | ...
  value: string;      // "VGV" | "Valor" | "Honorários" | ...
  agent: string;      // "Corretor IA" | "Assistente IA" | ...
  flow: string;       // "Processo" | "Protocolo" | "Rito" | ...
}

export interface FlowDefinition {
  name: string;
  description: string;
  trigger: Record<string, unknown>;
  steps: Array<{ type: string; action: Record<string, unknown> }>;
}

export interface AgentPersona {
  name: string;
  persona: string;
  skills: string[];
}

export interface SectorTemplate {
  id: SectorId;
  name: string;
  stages: StageConfig[];
  dealMetaSchema: z.ZodSchema;
  defaultFlows: FlowDefinition[];
  agentPersona: AgentPersona;
  vocabulary: UiVocabulary;
}

// ─── Template Engine ──────────────────────────────────────────────────────────

export class TemplateEngine {
  private template: SectorTemplate;

  constructor(sectorId: SectorId, private readonly registry: TemplateRegistry) {
    const t = registry.get(sectorId);
    if (!t) {
      throw new Error(`Template não encontrado para setor: ${sectorId}`);
    }
    this.template = t;
  }

  /** Valida o campo meta de um deal contra o schema do setor */
  parseDealMeta(meta: unknown): unknown {
    return this.template.dealMetaSchema.parse(meta);
  }

  /** Retorna os stages pré-configurados para o setor */
  getStages(): StageConfig[] {
    return this.template.stages;
  }

  /** Retorna o vocabulary para o UI */
  getVocabulary(): UiVocabulary {
    return this.template.vocabulary;
  }

  /** Retorna os flows padrão para instalação no workspace */
  getDefaultFlows(): FlowDefinition[] {
    return this.template.defaultFlows;
  }

  /** Retorna a persona do agente padrão */
  getAgentPersona(): AgentPersona {
    return this.template.agentPersona;
  }

  /** Retorna o template completo */
  getTemplate(): SectorTemplate {
    return this.template;
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export class TemplateRegistry {
  private templates = new Map<SectorId, SectorTemplate>();

  register(template: SectorTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: SectorId): SectorTemplate | undefined {
    return this.templates.get(id);
  }

  list(): SectorTemplate[] {
    return Array.from(this.templates.values());
  }
}

export const globalRegistry = new TemplateRegistry();
