export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { getSessionWorkspaceId } from "@/lib/session";
import { getInternalChannels } from "./_lib/internal-queries";
import { InternalChatClient } from "./_components/InternalChatClient";

export default async function InternoPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; dealId?: string }>;
}) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) redirect("/login");

  const channels = await getInternalChannels(workspaceId);
  const params = await searchParams;

  return (
    <InternalChatClient
      initialChannels={channels}
      initialChannelId={params.channel ?? null}
      initialDealId={params.dealId ?? null}
    />
  );
}
