import { db, type Prisma } from "@flow-os/db";

export async function resolveAuditAgentId(workspaceId: string): Promise<string | null> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return agent?.id ?? null;
}

export async function appendAuditLog(params: {
  workspaceId: string;
  action: string;
  input: Prisma.InputJsonObject;
  output: Prisma.InputJsonObject;
  success?: boolean;
  error?: string;
  modelUsed?: string;
  durationMs?: number;
}): Promise<void> {
  const agentId = await resolveAuditAgentId(params.workspaceId);
  if (!agentId) return;

  await db.agentAuditLog.create({
    data: {
      workspaceId: params.workspaceId,
      agentId,
      action: params.action,
      input: params.input,
      output: params.output,
      modelUsed: params.modelUsed ?? "none",
      tokensUsed: 0,
      costUsd: 0,
      durationMs: params.durationMs ?? 0,
      success: params.success ?? true,
      ...(params.error ? { error: params.error } : {}),
    },
  });
}

export async function getScopedTask(workspaceId: string, taskId: string) {
  return db.task.findFirst({
    where: { id: taskId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      dealId: true,
      assigneeId: true,
      aparelhoOrigem: true,
      deal: {
        select: {
          id: true,
          contactId: true,
          meta: true,
        },
      },
    },
  });
}
