import type { EisenhowerQuadrant, Task } from "../domain/types";

// ─── Motor Eisenhower ─────────────────────────────────────────────────────────

/**
 * Classifica uma tarefa no quadrante Eisenhower correto com base em
 * urgência e importância. Considera o prazo como fator de urgência automática.
 */
export function classifyQuadrant(
  urgent: boolean,
  important: boolean,
): EisenhowerQuadrant {
  if (urgent && important) return "Q1_DO";
  if (!urgent && important) return "Q2_PLAN";
  if (urgent && !important) return "Q3_DELEGATE";
  return "Q4_ELIMINATE";
}

/**
 * Verifica se uma tarefa deve ser recalculada como urgente com base no prazo.
 * Tarefas com prazo ≤ 2 dias são automaticamente urgentes.
 */
export function isUrgentByDeadline(dueAt: Date | null): boolean {
  if (!dueAt) return false;
  const now = new Date();
  const diffMs = dueAt.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= 2;
}

/**
 * Recalcula o quadrante de uma tarefa levando em conta o prazo atual.
 */
export function recalculateQuadrant(task: Pick<Task, "urgent" | "important" | "dueAt">): EisenhowerQuadrant {
  const effectivelyUrgent = task.urgent || isUrgentByDeadline(task.dueAt);
  return classifyQuadrant(effectivelyUrgent, task.important);
}

/**
 * Ordena tarefas pela prioridade Eisenhower: Q1 → Q2 → Q3 → Q4.
 * Dentro do mesmo quadrante, ordena por prazo.
 */
export function sortByEisenhower<T extends Pick<Task, "quadrant" | "dueAt">>(
  tasks: T[],
): T[] {
  const priority: Record<EisenhowerQuadrant, number> = {
    Q1_DO: 0,
    Q2_PLAN: 1,
    Q3_DELEGATE: 2,
    Q4_ELIMINATE: 3,
  };

  return [...tasks].sort((a, b) => {
    const qDiff = priority[a.quadrant] - priority[b.quadrant];
    if (qDiff !== 0) return qDiff;

    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
}

/**
 * Agrupa tarefas por quadrante para exibição no dashboard Eisenhower.
 */
export function groupByQuadrant<T extends Pick<Task, "quadrant">>(
  tasks: T[],
): Record<EisenhowerQuadrant, T[]> {
  return {
    Q1_DO: tasks.filter((t) => t.quadrant === "Q1_DO"),
    Q2_PLAN: tasks.filter((t) => t.quadrant === "Q2_PLAN"),
    Q3_DELEGATE: tasks.filter((t) => t.quadrant === "Q3_DELEGATE"),
    Q4_ELIMINATE: tasks.filter((t) => t.quadrant === "Q4_ELIMINATE"),
  };
}

export const EisenhowerLabels: Record<EisenhowerQuadrant, { title: string; description: string; color: string }> = {
  Q1_DO: {
    title: "Fazer Agora",
    description: "Urgente e Importante",
    color: "#ef4444",
  },
  Q2_PLAN: {
    title: "Planejar",
    description: "Importante, não urgente",
    color: "#3b82f6",
  },
  Q3_DELEGATE: {
    title: "Delegar",
    description: "Urgente, não importante",
    color: "#f59e0b",
  },
  Q4_ELIMINATE: {
    title: "Eliminar",
    description: "Nem urgente nem importante",
    color: "#6b7280",
  },
};
