import { db } from "@flow-os/db";

export interface InternalChannelSummary {
  id: string;
  nome: string;
  tipo: string;
  dealId: string | null;
  dealTitle: string | null;
  membros: string[];
  messageCount: number;
  latestAt: string | null;
}

export async function getInternalChannels(workspaceId: string): Promise<InternalChannelSummary[]> {
  const channels = await db.internalChannel.findMany({
    where: { workspaceId },
    include: {
      deal: { select: { id: true, title: true } },
      mensagens: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
      _count: {
        select: { mensagens: true },
      },
    },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
  });

  return channels.map((channel) => ({
    id: channel.id,
    nome: channel.nome,
    tipo: channel.tipo,
    dealId: channel.dealId ?? null,
    dealTitle: channel.deal?.title ?? null,
    membros: channel.membros,
    messageCount: channel._count.mensagens,
    latestAt: channel.mensagens[0]?.createdAt.toISOString() ?? null,
  }));
}
