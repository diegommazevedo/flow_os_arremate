/**
 * Bootstrap de stages + departamentos para novos workspaces (admin).
 * Stages Caixa alinhados a `@flow-os/templates` (15 etapas).
 */

import type { Prisma } from "@flow-os/db";
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
}
