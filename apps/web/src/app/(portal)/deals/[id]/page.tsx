import { notFound, redirect } from "next/navigation";
import { DealDetailClient } from "./_components/DealDetailClient";
import { getDealDetail } from "./_lib/deal-queries";
import { getSessionWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DealDetailPage({ params }: Props) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    redirect("/login");
  }

  const { id } = await params;
  const deal = await getDealDetail(workspaceId, id);
  if (!deal) {
    notFound();
  }

  return <DealDetailClient initialDeal={deal} />;
}
