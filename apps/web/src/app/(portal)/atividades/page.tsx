import { redirect } from "next/navigation";
import { ActivitiesClient } from "./_components/ActivitiesClient";
import { getActivitiesData } from "./_lib/activity-queries";
import { getSessionWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AtividadesPage() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    redirect("/login");
  }

  const data = await getActivitiesData(workspaceId);

  return (
    <ActivitiesClient
      initialRows={data.rows}
      openCount={data.openCount}
    />
  );
}
