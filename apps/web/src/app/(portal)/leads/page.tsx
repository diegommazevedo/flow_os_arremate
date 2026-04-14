import { redirect } from "next/navigation";
import { getSessionWorkspaceId } from "@/lib/session";
import { LeadsTable } from "./_components/LeadsTable";

export const metadata = { title: "Leads" };

export default async function LeadsPage() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    redirect("/login?next=/leads");
  }
  return <LeadsTable workspaceId={workspaceId} />;
}
