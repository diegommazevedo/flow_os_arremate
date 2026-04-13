import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import type { ReactNode } from "react";
import { db } from "@flow-os/db";
import type { SessionContext } from "@/lib/session";

function LetterIcon({ letter }: { letter: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        color: "var(--text-tertiary)",
        fontWeight: 500,
        width: "16px",
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      {letter}
    </span>
  );
}

function IconLeads() {
  return (
    <span className="flex w-4 flex-shrink-0 justify-center text-[var(--text-tertiary)]" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </span>
  );
}

function IconCampaigns() {
  return (
    <span className="flex w-4 flex-shrink-0 justify-center text-[var(--text-tertiary)]" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 11v2a4 4 0 0 0 4 4h2" strokeLinecap="round" />
        <path d="M7 11V9a4 4 0 0 1 4-4h6l3 3v8a4 4 0 0 1-4 4h-2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 6V3" strokeLinecap="round" />
        <path d="M18 9h3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function IconMotoboys() {
  return (
    <span className="flex w-4 flex-shrink-0 justify-center text-[var(--text-tertiary)]" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="5.5" cy="17.5" r="2.5" />
        <circle cx="18.5" cy="17.5" r="2.5" />
        <path d="M15 6a1 1 0 1 0 0-2h-1v4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 17h8M8 17l-2-7h4l2 3h5l-2 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function IconDossies() {
  return (
    <span className="flex w-4 flex-shrink-0 justify-center text-[var(--text-tertiary)]" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function IconAdmin() {
  return (
    <span className="flex w-4 flex-shrink-0 justify-center text-[var(--text-tertiary)]" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .65.4 1.24 1 1.51H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    </span>
  );
}

type NavHref =
  | "/dashboard"
  | "/kanban"
  | "/eisenhower"
  | "/chat"
  | "/emails"
  | "/interno"
  | "/atividades"
  | "/flows"
  | "/brain"
  | "/contacts"
  | "/leads"
  | "/campanhas"
  | "/motoboys"
  | "/dossies"
  | "/analytics"
  | "/settings"
  | "/admin/workspaces";

type NavEntry =
  | { kind: "section"; label: string }
  | { kind: "item"; href: NavHref; label: string; icon: ReactNode };

const NAV_ENTRIES: NavEntry[] = [
  { kind: "item", href: "/dashboard", label: "Dashboard", icon: <LetterIcon letter="D" /> },
  { kind: "item", href: "/kanban", label: "Kanban", icon: <LetterIcon letter="K" /> },
  { kind: "item", href: "/eisenhower", label: "Eisenhower", icon: <LetterIcon letter="E" /> },
  { kind: "item", href: "/chat", label: "Chat", icon: <LetterIcon letter="C" /> },
  { kind: "item", href: "/emails", label: "Emails", icon: <LetterIcon letter="@" /> },
  { kind: "item", href: "/interno", label: "Interno", icon: <LetterIcon letter="I" /> },
  { kind: "item", href: "/atividades", label: "Atividades", icon: <LetterIcon letter="A" /> },
  { kind: "item", href: "/flows", label: "Fluxos", icon: <LetterIcon letter="F" /> },
  { kind: "item", href: "/brain", label: "Brain IA", icon: <LetterIcon letter="B" /> },
  { kind: "item", href: "/contacts", label: "Contatos", icon: <LetterIcon letter="P" /> },
  { kind: "section", label: "Captação e dossiê" },
  { kind: "item", href: "/leads", label: "Leads", icon: <IconLeads /> },
  { kind: "item", href: "/campanhas", label: "Campanhas", icon: <IconCampaigns /> },
  { kind: "item", href: "/motoboys", label: "Motoboys", icon: <IconMotoboys /> },
  { kind: "item", href: "/dossies", label: "Dossiês", icon: <IconDossies /> },
  { kind: "item", href: "/analytics", label: "Analytics", icon: <LetterIcon letter="Y" /> },
  { kind: "item", href: "/settings", label: "Configurações", icon: <LetterIcon letter="S" /> },
];

const getNavBadges = unstable_cache(
  async (workspaceId: string) => {
    const [
      openActivities,
      q1Alerts,
      internalTotal,
      q1DealsCount,
      unreadEmails,
      leadCount,
      runningCampaigns,
      chatUnreadSum,
    ] = await Promise.all([
      db.task.count({ where: { workspaceId, completedAt: null } }).catch(() => 0),
      db.internalMessage.count({ where: { workspaceId, channel: { nome: "alertas-q1" } } }).catch(() => 0),
      db.internalMessage.count({ where: { workspaceId } }).catch(() => 0),
      db.deal.count({
        where: { workspaceId, closedAt: null, meta: { path: ["eisenhower"], equals: "Q1_DO" } },
      }).catch(() => 0),
      db.email.count({ where: { workspaceId, lido: false } }).catch(() => 0),
      db.contact.count({ where: { workspaceId } }).catch(() => 0),
      db.campaign.count({ where: { workspaceId, status: "RUNNING" } }).catch(() => 0),
      db.chatSession
        .aggregate({
          where: { workspaceId },
          _sum: { unreadCount: true },
        })
        .catch(() => ({ _sum: { unreadCount: null as number | null } })),
    ]);
    return {
      openActivities,
      q1Alerts,
      internalTotal,
      q1DealsCount,
      unreadEmails,
      leadCount,
      runningCampaigns,
      chatUnreadSum: chatUnreadSum._sum.unreadCount ?? 0,
    };
  },
  ["nav-badges"],
  { revalidate: 30 },
);

function buildBadgeMap(counts: Awaited<ReturnType<typeof getNavBadges>>): Partial<Record<NavHref, React.ReactNode>> {
  const {
    openActivities,
    q1Alerts,
    internalTotal,
    q1DealsCount,
    unreadEmails,
    leadCount,
    runningCampaigns,
    chatUnreadSum,
  } = counts;

  return {
    "/leads":
      leadCount > 0 ? (
        <span
          style={{
            background: "var(--surface-overlay)",
            borderRadius: "99px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "1px 5px",
            color: "var(--text-secondary)",
            fontWeight: 600,
          }}
        >
          {leadCount > 999 ? "999+" : leadCount}
        </span>
      ) : null,
    "/campanhas":
      runningCampaigns > 0 ? (
        <span
          style={{
            background: "var(--color-q1)",
            borderRadius: "99px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "1px 5px",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {runningCampaigns}
        </span>
      ) : null,
    "/chat":
      chatUnreadSum > 0 ? (
        <span
          style={{
            background: "var(--color-q1)",
            borderRadius: "99px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "1px 5px",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {chatUnreadSum > 99 ? "99+" : chatUnreadSum}
        </span>
      ) : null,
    "/atividades":
      openActivities > 0 ? (
        <span
          style={{
            background: "var(--color-q1)",
            borderRadius: "99px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "1px 5px",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {openActivities}
        </span>
      ) : null,
    "/eisenhower":
      q1DealsCount > 0 ? (
        <span
          style={{
            background: "var(--color-q1)",
            borderRadius: "99px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "1px 5px",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {q1DealsCount}
        </span>
      ) : null,
    "/emails":
      unreadEmails > 0 ? (
        <span
          style={{
            background: "var(--surface-overlay)",
            borderRadius: "99px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "1px 5px",
            color: "var(--text-secondary)",
            fontWeight: 600,
          }}
        >
          {unreadEmails}
        </span>
      ) : null,
    "/interno":
      q1Alerts > 0 || internalTotal > 0 ? (
        <span
          style={{
            background: q1Alerts > 0 ? "var(--color-q1)" : "var(--surface-overlay)",
            borderRadius: "99px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "1px 5px",
            color: q1Alerts > 0 ? "#fff" : "var(--text-secondary)",
            fontWeight: 600,
          }}
        >
          {q1Alerts > 0 ? q1Alerts : internalTotal}
        </span>
      ) : null,
  };
}

function NavLinks({
  badges = {},
  showAdmin,
}: {
  badges?: Partial<Record<NavHref, React.ReactNode>>;
  showAdmin: boolean;
}) {
  const entries: NavEntry[] = [...NAV_ENTRIES];
  if (showAdmin) {
    entries.push({
      kind: "item",
      href: "/admin/workspaces",
      label: "Admin",
      icon: <IconAdmin />,
    });
  }

  return (
    <>
      {entries.map((entry, i) => {
        if (entry.kind === "section") {
          return (
            <div
              key={`section-${entry.label}-${i}`}
              className="mx-2 mb-1 mt-3 px-3 first:mt-0"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.08em",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
              }}
            >
              — {entry.label} —
            </div>
          );
        }
        return (
          <Link
            key={entry.href}
            href={entry.href}
            className="mx-2 flex items-center gap-2.5 rounded-lg transition-all duration-150 hover:[background:var(--surface-hover)]"
            style={{ padding: "6px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-display)" }}
          >
            {entry.icon}
            <span style={{ fontSize: "13px", fontWeight: 500, flex: 1 }}>{entry.label}</span>
            {badges[entry.href] ?? null}
          </Link>
        );
      })}
    </>
  );
}

async function NavWithBadges({ workspaceId, showAdmin }: { workspaceId: string; showAdmin: boolean }) {
  const counts = await getNavBadges(workspaceId);
  return <NavLinks badges={buildBadgeMap(counts)} showAdmin={showAdmin} />;
}

export function PortalSidebar({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: SessionContext["role"];
}) {
  const showAdmin = role === "SUPER_ADMIN";

  return (
    <aside
      className="flex flex-shrink-0 flex-col"
      style={{
        width: "220px",
        background: "var(--surface-raised)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex h-14 items-center px-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: "15px",
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          FlowOS
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", marginLeft: "6px" }}>
          v4
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <Suspense fallback={<NavLinks showAdmin={showAdmin} />}>
          <NavWithBadges workspaceId={workspaceId} showAdmin={showAdmin} />
        </Suspense>
      </nav>

      <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <span
            className="animate-pulse-dot"
            style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--color-success)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>
            núcleo ativo
          </span>
        </div>
      </div>
    </aside>
  );
}
