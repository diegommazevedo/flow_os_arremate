import { db, TaskPriority } from "@flow-os/db";

export interface ActivityRow {
  id: string;
  completedAt: string | null;
  subject: string;
  dealId: string | null;
  dealTitle: string | null;
  priority: keyof typeof TaskPriority;
  person: string | null;
  email: string | null;
  phone: string | null;
  dueAt: string | null;
  assigneeId: string | null;
  type: string | null;
}

export interface ActivitiesData {
  rows: ActivityRow[];
  openCount: number;
}

function asIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export async function getActivitiesData(workspaceId: string): Promise<ActivitiesData> {
  const tasks = await db.task.findMany({
    where: { workspaceId },
    include: {
      deal: {
        include: {
          contact: {
            select: {
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
    orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
  });

  return {
    rows: tasks.map((task) => ({
      id: task.id,
      completedAt: asIso(task.completedAt),
      subject: task.title,
      dealId: task.dealId,
      dealTitle: task.deal?.title ?? null,
      priority: task.priority,
      person: task.deal?.contact?.name ?? null,
      email: task.deal?.contact?.email ?? null,
      phone: task.deal?.contact?.phone ?? null,
      dueAt: asIso(task.dueAt),
      assigneeId: task.assigneeId,
      type: task.type,
    })),
    openCount: tasks.filter((task) => !task.completedAt).length,
  };
}
