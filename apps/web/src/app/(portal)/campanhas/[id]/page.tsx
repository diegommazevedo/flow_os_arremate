import { redirect } from "next/navigation";
import { getSessionWorkspaceId } from "@/lib/session";
import { CampaignMonitor } from "./_components/CampaignMonitor";

export const metadata = { title: "Campanha" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    redirect("/login?next=/campanhas");
  }
  const { id } = await params;
  return <CampaignMonitor campaignId={id} />;
}
