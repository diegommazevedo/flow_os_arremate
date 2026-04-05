import { db, TaskPriority } from "@flow-os/db";

export interface DealDetailNote {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface DealDetailActivity {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  priority: keyof typeof TaskPriority;
  assigneeId: string | null;
  dueAt: string | null;
  completedAt: string | null;
}

export interface DealDetailDocument {
  id: string;
  name: string;
  url: string;
  contentType: string;
  createdAt: string;
}

export interface DealDetailHistory {
  id: string;
  action: string;
  createdAt: string;
  success: boolean;
  input: unknown;
  output: unknown;
}

export interface DealDetailProtocol {
  id: string;
  number: string;
  status: string;
  canal: string;
  assunto: string | null;
  createdAt: string;
  updatedAt: string;
  mensagensCount: number;
}

export interface DealDetailData {
  id: string;
  title: string;
  value: number | null;
  ownerId: string | null;
  stageId: string;
  stageName: string;
  closedAt: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  meta: Record<string, unknown>;
  notes: DealDetailNote[];
  activities: DealDetailActivity[];
  documents: DealDetailDocument[];
  history: DealDetailHistory[];
  protocols: DealDetailProtocol[];
  assigneeOptions: string[];
}

function asIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function includesDealId(payload: unknown, dealId: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  if (record["dealId"] === dealId) return true;
  if (typeof record["noteId"] === "string" && typeof record["dealId"] === "string") return record["dealId"] === dealId;
  return false;
}

export async function getDealDetail(workspaceId: string, dealId: string): Promise<DealDetailData | null> {
  const deal = await db.deal.findFirst({
    where: { id: dealId, workspaceId },
    include: {
      stage: true,
      contact: true,
      tasks: {
        orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
      notes: {
        orderBy: { createdAt: "desc" },
      },
      protocols: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { mensagens: true },
          },
        },
      },
    },
  });

  if (!deal) return null;

  const auditLogs = await db.agentAuditLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const history = auditLogs
    .filter((log) => includesDealId(log.input, dealId) || includesDealId(log.output, dealId))
    .slice(0, 20)
    .map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      success: log.success,
      input: log.input,
      output: log.output,
    }));

  const assigneeCandidates = new Set<string>();
  if (deal.ownerId) assigneeCandidates.add(deal.ownerId);
  for (const task of deal.tasks) {
    if (task.assigneeId) assigneeCandidates.add(task.assigneeId);
  }

  const members = await db.member.findMany({
    where: { workspaceId },
    select: { userId: true },
  });

  for (const member of members) {
    assigneeCandidates.add(member.userId);
  }

  return {
    id: deal.id,
    title: deal.title,
    value: deal.value ? Number(deal.value) : null,
    ownerId: deal.ownerId,
    stageId: deal.stageId,
    stageName: deal.stage.name,
    closedAt: asIso(deal.closedAt),
    lostReason: deal.lostReason,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    contact: {
      id: deal.contact?.id ?? null,
      name: deal.contact?.name ?? null,
      email: deal.contact?.email ?? null,
      phone: deal.contact?.phone ?? null,
    },
    meta: (deal.meta ?? {}) as Record<string, unknown>,
    notes: deal.notes.map((note) => ({
      id: note.id,
      authorId: note.authorId,
      authorName: note.authorName,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    })),
    activities: deal.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueAt: asIso(task.dueAt),
      completedAt: asIso(task.completedAt),
    })),
    documents: deal.documents.map((document) => ({
      id: document.id,
      name: document.name,
      url: document.url,
      contentType: document.contentType,
      createdAt: document.createdAt.toISOString(),
    })),
    history,
    protocols: deal.protocols.map((protocol) => ({
      id: protocol.id,
      number: protocol.number,
      status: protocol.status,
      canal: protocol.canal,
      assunto: protocol.assunto,
      createdAt: protocol.createdAt.toISOString(),
      updatedAt: protocol.updatedAt.toISOString(),
      mensagensCount: protocol._count.mensagens,
    })),
    assigneeOptions: Array.from(assigneeCandidates).sort(),
  };
}
