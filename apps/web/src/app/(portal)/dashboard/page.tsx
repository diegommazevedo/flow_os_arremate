import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionWorkspaceId } from "@/lib/session";
import { getDashboardMetrics } from "./_lib/dashboard-queries";
import { DashboardClient } from "./_components/DashboardClient";

export const dynamic  = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-gray-800 rounded mb-2" />
          <div className="h-4 w-48 bg-gray-800 rounded" />
        </div>
        <div className="h-5 w-20 bg-gray-800 rounded" />
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card space-y-2">
            <div className="h-3 w-20 bg-gray-800 rounded" />
            <div className="h-8 w-12 bg-gray-700 rounded" />
            <div className="h-3 w-16 bg-gray-800 rounded" />
          </div>
        ))}
      </div>

      {/* Sections */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="h-5 w-40 bg-gray-800 rounded" />
          <div className="h-24 bg-gray-800 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

async function DashboardContent() {
  // [SEC-03] workspaceId APENAS da sessÃ£o â€” nunca de env ou fallback
  const workspaceId = await getSessionWorkspaceId();

  if (!workspaceId) {
    redirect("/login");
  }

  let metrics;
  try {
    metrics = await getDashboardMetrics(workspaceId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return (
      <div className="card border-red-900/50 bg-red-950/10">
        <p className="text-red-400 font-medium">Erro ao carregar mÃ©tricas</p>
        <p className="text-xs text-gray-500 mt-1">{msg}</p>
        <p className="text-xs text-gray-600 mt-2">
          Verifique se DATABASE_URL estÃ¡ configurado e o banco estÃ¡ acessÃ­vel.
        </p>
      </div>
    );
  }

  return <DashboardClient initial={metrics} workspaceId={workspaceId} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
