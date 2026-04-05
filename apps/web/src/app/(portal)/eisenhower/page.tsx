import { redirect } from "next/navigation";
import { getSessionWorkspaceId } from "@/lib/session";
import { fetchEisenhowerDeals } from "./_lib/eisenhower-queries";
import { EisenhowerClient } from "./_components/EisenhowerClient";

export const dynamic = "force-dynamic";

export default async function EisenhowerPage() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) redirect("/login");

  const initialDeals = await fetchEisenhowerDeals(workspaceId);

  return (
    <EisenhowerClient
      initialDeals={initialDeals}
      workspaceId={workspaceId}
    />
  );
}
