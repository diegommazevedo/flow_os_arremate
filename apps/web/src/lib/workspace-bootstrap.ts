/**
 * Bootstrap de stages + departamentos para novos workspaces (admin).
 * Stages Caixa alinhados a `@flow-os/templates` (15 etapas).
 */

import type { Prisma } from "@flow-os/db";
import { DEFAULT_MISSION_ITEMS } from "@flow-os/brain/workers/mission-profile-default-items";
import {
  CAIXA_PIPELINE_SLA_DAYS,
  PIPELINE_STAGE_COLORS,
  PIPELINE_STAGES,
} from "@flow-os/templates";

export const BOOTSTRAP_DEPARTMENTS_CAIXA = [
  "ATD_SUDESTE_SP",
  "ATD_SUL",
  "ATD_CENTRO_OESTE",
  "ATD_NORDESTE",
  "ATD_NORTE",
] as const;

export const BOOTSTRAP_DEPARTMENTS_GENERIC = ["Comercial", "Operações", "Suporte"] as const;

const DEFAULT_SKIP_REASONS = [
  "Área de risco",
  "Muro / tapume",
  "Vigilante impediu",
  "Chuva intensa",
  "Imóvel demolido",
] as const;

const ITEMS_JSON = DEFAULT_MISSION_ITEMS as unknown as Prisma.InputJsonValue;

/** Perfis de missão seed (4) — todo workspace novo. */
export async function seedMissionProfiles(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  const rows: Array<{
    name: string;
    level: "DOWN" | "STANDARD" | "UP";
    description: string;
    isDefault: boolean;
    bandeiradaValue: number;
    maxValue: number;
    skipPenalty: boolean;
    skipRequiresText: boolean;
    skipMaxItems?: number;
    autoSelectRules?: Prisma.InputJsonValue;
  }> = [
    {
      name: "Missão Simplificada",
      level: "DOWN",
      description: "Imóvel de fácil acesso, zona tranquila, sem intercorrências esperadas",
      isDefault: false,
      bandeiradaValue: 3000,
      maxValue: 6000,
      skipPenalty: false,
      skipRequiresText: false,
    },
    {
      name: "Padrão",
      level: "STANDARD",
      description: "Perfil neutro — usado quando não há regra de auto-seleção",
      isDefault: true,
      bandeiradaValue: 4000,
      maxValue: 8000,
      skipPenalty: true,
      skipRequiresText: true,
    },
    {
      name: "Missão Complexa",
      level: "UP",
      description: "Área de risco, difícil acesso, ocupação ou zona remota",
      isDefault: false,
      bandeiradaValue: 5000,
      maxValue: 10000,
      skipPenalty: false,
      skipRequiresText: true,
      skipMaxItems: 5,
    },
    {
      name: "Área de Risco",
      level: "UP",
      description: "Match automático por palavras no endereço (favela, comunidade, morro)",
      isDefault: false,
      bandeiradaValue: 5000,
      maxValue: 10000,
      skipPenalty: false,
      skipRequiresText: true,
      skipMaxItems: 5,
      autoSelectRules: {
        keywords: ["favela", "comunidade", "morro", "tráfico", "milícia"],
        priority: 5,
      },
    },
  ];

  for (const r of rows) {
    await tx.missionProfile.create({
      data: {
        workspaceId,
        name: r.name,
        description: r.description,
        isDefault: r.isDefault,
        isActive: true,
        level: r.level,
        bandeiradaValue: r.bandeiradaValue,
        maxValue: r.maxValue,
        currency: "BRL",
        items: ITEMS_JSON,
        skipPenalty: r.skipPenalty,
        skipRequiresText: r.skipRequiresText,
        skipMinChars: 10,
        skipMaxItems: r.skipMaxItems ?? 3,
        skipReasons: [...DEFAULT_SKIP_REASONS],
        agentLimit: 3,
        followupDelayMs: 7_200_000,
        deadlineHours: 48,
        autoSelectRules: (r.autoSelectRules ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

const GENERIC_STAGES = [
  { name: "Novo", color: "#64748b", slaDays: 7 as number | null, isWon: false },
  { name: "Em andamento", color: "#0ea5e9", slaDays: 14 as number | null, isWon: false },
  { name: "Concluído", color: "#22c55e", slaDays: null as number | null, isWon: true },
] as const;

export async function bootstrapWorkspaceContent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  template: "caixa" | "generic",
): Promise<void> {
  if (template === "caixa") {
    for (const stage of PIPELINE_STAGES) {
      const index = stage.order - 1;
      const sla = CAIXA_PIPELINE_SLA_DAYS[index];
      const color = PIPELINE_STAGE_COLORS[index] ?? "#64748b";
      await tx.stage.create({
        data: {
          workspaceId,
          name: stage.label,
          color,
          position: index,
          slaDays: sla ?? null,
          isWon: stage.id === "processo_concluido",
          isLost: false,
        },
      });
    }
    for (const nome of BOOTSTRAP_DEPARTMENTS_CAIXA) {
      await tx.department.create({
        data: { workspaceId, nome, membros: [] },
      });
    }
    await seedMissionProfiles(tx, workspaceId);
    return;
  }

  for (let i = 0; i < GENERIC_STAGES.length; i++) {
    const s = GENERIC_STAGES[i]!;
    await tx.stage.create({
      data: {
        workspaceId,
        name: s.name,
        color: s.color,
        position: i,
        slaDays: s.slaDays ?? null,
        isWon: s.isWon,
        isLost: false,
      },
    });
  }
  for (const nome of BOOTSTRAP_DEPARTMENTS_GENERIC) {
    await tx.department.create({
      data: { workspaceId, nome, membros: [] },
    });
  }
  await seedMissionProfiles(tx, workspaceId);
}
