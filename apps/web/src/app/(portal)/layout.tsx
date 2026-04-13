import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode } from "react";
import { headers } from "next/headers";
import { getSessionContext } from "@/lib/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { PortalSidebar } from "./_components/PortalSidebar";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getSessionContext();
  if (!session?.workspaceId) {
    const pathname =
      (await headers()).get("x-flowos-pathname")?.trim() || "/dashboard";
    const nextParam = encodeURIComponent(
      pathname.startsWith("/") ? pathname : `/${pathname}`,
    );
    redirect(`/login?next=${nextParam}`);
  }

  const { workspaceId, role } = session;

  return (
    <div className="flex h-screen overflow-hidden">
      <PortalSidebar workspaceId={workspaceId} role={role} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="flex flex-shrink-0 items-center justify-between px-6"
          style={{ height: 'var(--header-height)', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div />
          <div className="flex items-center gap-3">
            <Link
              href="/kanban"
              className="rounded transition-colors duration-150"
              style={{ padding: '4px 10px', fontSize: '12px', fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
            >
              Ver pipeline
            </Link>
            <ThemeToggle />
            <div
              className="flex items-center justify-center rounded-full text-xs font-bold"
              style={{ width: '28px', height: '28px', background: 'var(--text-accent)', color: '#fff' }}
            >
              U
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--surface-base)' }}>{children}</main>
      </div>
    </div>
  );
}
