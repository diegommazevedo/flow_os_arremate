import Link               from "next/link";
import { Suspense }       from "react";
import { unstable_cache } from "next/cache";
import { type ReactNode } from "react";
import { db }             from "@flow-os/db";
import { getSessionWorkspaceId } from "@/lib/session";
import { ThemeToggle }    from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/dashboard",   label: "Dashboard",    icon: "D" },
  { href: "/kanban",      label: "Kanban",        icon: "K" },
  { href: "/eisenhower",  label: "Eisenhower",    icon: "E" },
  { href: "/chat",        label: "Chat",          icon: "C" },
  { href: "/interno",     label: "Interno",       icon: "I" },
  { href: "/atividades",  label: "Atividades",    icon: "A" },
  { href: "/flows",       label: "Fluxos",        icon: "F" },
  { href: "/brain",       label: "Brain IA",      icon: "B" },
  { href: "/contacts",    label: "Contatos",      icon: "P" },
  { href: "/analytics",   label: "Analytics",     icon: "N" },
  { href: "/settings",    label: "Configuracoes", icon: "S" },
] as const;

type NavHref = (typeof NAV_ITEMS)[number]["href"];

// ─── Queries com cache de 30s ─────────────────────────────────────────────────
// Evita 4 queries bloqueantes a cada clique de menu.

const getNavBadges = unstable_cache(
  async (workspaceId: string) => {
    const [openActivities, q1Alerts, internalTotal, q1DealsCount] =
      await Promise.all([
        db.task.count({ where: { workspaceId, completedAt: null } }).catch(() => 0),
        db.internalMessage.count({ where: { workspaceId, channel: { nome: "alertas-q1" } } }).catch(() => 0),
        db.internalMessage.count({ where: { workspaceId } }).catch(() => 0),
        db.deal.count({
          where: { workspaceId, closedAt: null, meta: { path: ["eisenhower"], equals: "Q1_DO" } },
        }).catch(() => 0),
      ]);
    return { openActivities, q1Alerts, internalTotal, q1DealsCount };
  },
  ["nav-badges"],
  { revalidate: 30 },
);

// ─── Nav com badges (async) ───────────────────────────────────────────────────
// Um único componente assíncrono para os 4 counts — renderiza atrás do Suspense.

async function NavWithBadges({ workspaceId }: { workspaceId: string }) {
  const { openActivities, q1Alerts, internalTotal, q1DealsCount } =
    await getNavBadges(workspaceId);

  const badges: Partial<Record<NavHref, React.ReactNode>> = {
    "/atividades": openActivities > 0 ? (
      <span style={{ background: 'var(--color-q1)', borderRadius: '99px', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '1px 5px', color: '#fff', fontWeight: 600 }}>
        {openActivities}
      </span>
    ) : null,
    "/eisenhower": q1DealsCount > 0 ? (
      <span style={{ background: 'var(--color-q1)', borderRadius: '99px', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '1px 5px', color: '#fff', fontWeight: 600 }}>
        {q1DealsCount}
      </span>
    ) : null,
    "/interno": (q1Alerts > 0 || internalTotal > 0) ? (
      <span style={{ background: q1Alerts > 0 ? 'var(--color-q1)' : 'var(--surface-overlay)', borderRadius: '99px', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '1px 5px', color: q1Alerts > 0 ? '#fff' : 'var(--text-secondary)', fontWeight: 600 }}>
        {q1Alerts > 0 ? q1Alerts : internalTotal}
      </span>
    ) : null,
  };

  return <NavLinks badges={badges} />;
}

// ─── Nav sem badges (fallback instantâneo) ────────────────────────────────────

function NavLinks({ badges = {} }: { badges?: Partial<Record<NavHref, React.ReactNode>> }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="mx-2 flex items-center gap-2.5 rounded-lg transition-all duration-150 hover:[background:var(--surface-hover)]"
          style={{ padding: '6px 12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-tertiary)',
              fontWeight: 500,
              width: '16px',
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            {item.icon}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>{item.label}</span>
          {badges[item.href as NavHref] ?? null}
        </Link>
      ))}
    </>
  );
}

// ─── Layout principal ─────────────────────────────────────────────────────────

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const workspaceId = await getSessionWorkspaceId();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="flex flex-shrink-0 flex-col"
        style={{ width: '220px', background: 'var(--surface-raised)', borderRight: '1px solid var(--border-subtle)' }}
      >
        <div className="flex h-14 items-center px-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '15px', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            FlowOS
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '6px' }}>
            v4
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {/*
            Suspense com fallback instantâneo (sem badges):
            → página renderiza imediatamente
            → badges aparecem quando o cache responde (~30s TTL)
          */}
          <Suspense fallback={<NavLinks />}>
            {workspaceId
              ? <NavWithBadges workspaceId={workspaceId} />
              : <NavLinks />
            }
          </Suspense>
        </nav>

        <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <span className="animate-pulse-dot" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
              núcleo ativo
            </span>
          </div>
        </div>
      </aside>

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
