import type { Deal, Stage, StageId } from "../domain/types";
import { FlowOSError } from "../domain/types";

// ─── Motor Kanban ─────────────────────────────────────────────────────────────

export interface KanbanColumn {
  stage: Stage;
  deals: Deal[];
  velocity: number;    // deals fechados/semana nos últimos 30 dias
  avgDaysInStage: number;
  slaBreaches: number; // deals que excederam o SLA
  wipPercentage: number | null; // % do WIP limit usado (null se sem WIP)
}

export interface KanbanBoard {
  workspaceId: string;
  columns: KanbanColumn[];
  totalDeals: number;
  totalValue: number;
  updatedAt: Date;
}

/**
 * Verifica se um deal pode ser movido para o stage de destino.
 * Lança FlowOSError se a transição for inválida.
 */
export function validateTransition(
  deal: Deal,
  fromStage: Stage,
  toStage: Stage,
  allDealsInToStage: Deal[],
): void {
  // Verifica WIP limit
  if (toStage.wipLimit !== null) {
    if (allDealsInToStage.length >= toStage.wipLimit) {
      throw new FlowOSError(
        `Stage "${toStage.name}" atingiu o limite WIP de ${toStage.wipLimit} deal(s). Conclua um deal antes de mover.`,
        "WIP_LIMIT_REACHED",
      );
    }
  }

  // Não pode mover de um stage final para um stage não-final
  if ((fromStage.isWon || fromStage.isLost) && !toStage.isWon && !toStage.isLost) {
    throw new FlowOSError(
      `Deal "${deal.title}" já foi ${fromStage.isWon ? "ganho" : "perdido"} e não pode ser reaberto para este stage.`,
      "INVALID_STAGE_TRANSITION",
    );
  }
}

/**
 * Calcula quantos dias um deal está no stage atual.
 */
export function daysInCurrentStage(deal: Deal): number {
  const ref = deal.updatedAt ?? deal.createdAt;
  const diffMs = Date.now() - ref.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Verifica se um deal violou o SLA do stage.
 */
export function hasSLABreach(deal: Deal, stage: Stage): boolean {
  if (!stage.slaDays) return false;
  return daysInCurrentStage(deal) > stage.slaDays;
}

/**
 * Constrói o board Kanban completo a partir de stages e deals.
 */
export function buildKanbanBoard(
  workspaceId: string,
  stages: Stage[],
  deals: Deal[],
  recentlyWonDeals: { stageId: StageId; closedAt: Date }[],
): KanbanBoard {
  const sortedStages = [...stages].sort((a, b) => a.position - b.position);

  const columns: KanbanColumn[] = sortedStages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    const slaBreaches = stageDeals.filter((d) => hasSLABreach(d, stage)).length;

    const wipPercentage =
      stage.wipLimit !== null
        ? Math.round((stageDeals.length / stage.wipLimit) * 100)
        : null;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentWons = recentlyWonDeals.filter(
      (d) => d.stageId === stage.id && d.closedAt >= thirtyDaysAgo,
    );
    const velocity = (recentWons.length / 4.3); // 30 dias ÷ 7 ≈ 4.3 semanas

    const avgDaysInStage =
      stageDeals.length > 0
        ? stageDeals.reduce((sum, d) => sum + daysInCurrentStage(d), 0) /
          stageDeals.length
        : 0;

    return {
      stage,
      deals: stageDeals,
      velocity: Math.round(velocity * 10) / 10,
      avgDaysInStage: Math.round(avgDaysInStage),
      slaBreaches,
      wipPercentage,
    };
  });

  const totalValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return {
    workspaceId,
    columns,
    totalDeals: deals.length,
    totalValue,
    updatedAt: new Date(),
  };
}
