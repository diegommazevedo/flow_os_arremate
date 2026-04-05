/**
 * Painel DevOps — diagnóstico e logs locais (`.logs/`).
 * [SEC-03] Apenas DEV | OWNER | ADMIN.
 */
import { redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { getSessionContext } from "@/lib/session";
import { getMonorepoLogsRoot } from "@/lib/diagnostics-log-root";

function allowDevops(role: string | undefined): boolean {
  return role === "DEV" || role === "OWNER" || role === "ADMIN";
}

export default async function DevopsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/");
  if (!allowDevops(ctx.role)) redirect("/dashboard");

  const reportPath = path.join(getMonorepoLogsRoot(), "diagnose-report.md");
  let report = "";
  try {
    report = fs.readFileSync(reportPath, "utf8");
  } catch {
    report =
      "Nenhum relatorio encontrado. Na raiz do monorepo execute: pnpm diagnose";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 text-gray-100">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">DevOps / Diagnostico</h1>
        <p className="mt-2 text-sm text-gray-400">
          Logs em{" "}
          <code className="rounded bg-gray-800 px-1 py-0.5 text-xs">.logs/</code> na raiz do monorepo.
          APIs:{" "}
          <code className="text-xs">/api/devops/diagnose</code>,{" "}
          <code className="text-xs">/api/devops/logs</code>,{" "}
          <code className="text-xs">/api/devops/auditorias</code>.
        </p>
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <h2 className="text-lg font-medium text-white">diagnose-report.md</h2>
        <p className="mb-3 text-xs text-gray-500">{reportPath}</p>
        <pre className="max-h-[480px] overflow-auto rounded-md bg-gray-950 p-4 text-xs leading-relaxed text-gray-300 whitespace-pre-wrap">
          {report}
        </pre>
      </section>

      <section className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/api/devops/diagnose"
          className="rounded-md border border-gray-700 px-3 py-2 text-brand-400 hover:bg-gray-800"
        >
          JSON — diagnose
        </Link>
        <Link
          href="/api/devops/auditorias"
          className="rounded-md border border-gray-700 px-3 py-2 text-brand-400 hover:bg-gray-800"
        >
          JSON — auditorias
        </Link>
        <Link
          href="/api/devops/logs?category=runtime-errors"
          className="rounded-md border border-gray-700 px-3 py-2 text-brand-400 hover:bg-gray-800"
        >
          JSON — runtime-errors (lista)
        </Link>
      </section>
    </div>
  );
}
