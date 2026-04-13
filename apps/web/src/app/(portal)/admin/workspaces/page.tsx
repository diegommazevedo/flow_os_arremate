import { redirect } from "next/navigation";
import { db } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { AdminWorkspacesClient } from "./AdminWorkspacesClient";

export default async function AdminWorkspacesPage() {
  const session = await getSessionContext();
  if (!session?.workspaceId || !session.userId) {
    redirect("/login?next=%2Fadmin%2Fworkspaces");
  }
  if (session.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const workspaces = await db.workspace.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      sector: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });

  const serialized = workspaces.map((w) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
  }));

  return <AdminWorkspacesClient initial={serialized} />;
}
