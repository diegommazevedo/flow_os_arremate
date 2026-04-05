/**
 * /kanban â€” Board Kanban (Server Component)
 * [SEC-03] Auth via sessÃ£o â€” mesmo padrÃ£o do dashboard.
 */

export const dynamic    = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionWorkspaceId } from "@/lib/session";
import { KanbanBoard } from "./_components/KanbanBoard";
import { KanbanSkeleton } from "./_components/KanbanSkeleton";
import { getKanbanDeals } from "./_lib/kanban-queries";

export const metadata: Metadata = {
  title: "Kanban",
  description: "Board Kanban com swimlanes Eisenhower e drag-and-drop",
};

export default async function KanbanPage() {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) redirect("/login");

  const initialDeals = await getKanbanDeals(workspaceId);

  return (
    <div className="h-full flex flex-col">
      <Suspense fallback={<KanbanSkeleton />}>
        <KanbanBoard initialDeals={initialDeals} />
      </Suspense>
    </div>
  );
}
