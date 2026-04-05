import { db, ProtocolChannel, type Protocol } from "@flow-os/db";

function deriveItemIdentifier(title: string, dealId: string): string {
  const head = title.split(" - ")[0]?.trim();
  if (head && head.length > 0) return head;
  return dealId.slice(-12).toUpperCase();
}

export async function generateProtocol(
  dealId: string,
  workspaceId: string,
  canal: ProtocolChannel = ProtocolChannel.WHATSAPP,
  assunto?: string,
  taskId?: string,
): Promise<{ protocol: Protocol; number: string }> {
  return db.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, workspaceId },
      select: { id: true, title: true, protocolSeq: true },
    });

    if (!deal) {
      throw new Error("Deal not found");
    }

    await tx.deal.updateMany({
      where: { id: deal.id, workspaceId },
      data: { protocolSeq: { increment: 1 } },
    });
    const updatedDeal = await tx.deal.findFirst({
      where: { id: deal.id, workspaceId },
      select: { protocolSeq: true },
    });
    if (!updatedDeal) throw new Error("Deal not found after update");

    const itemId = deriveItemIdentifier(deal.title, deal.id);
    const number = `CHB-${itemId}-${String(updatedDeal.protocolSeq).padStart(3, "0")}`;

    const protocol = await tx.protocol.create({
      data: {
        workspaceId,
        number,
        dealId: deal.id,
        ...(taskId ? { taskId } : {}),
        canal,
        assunto: assunto ?? null,
        status: "ABERTO",
      },
    });

    return { protocol, number };
  });
}
