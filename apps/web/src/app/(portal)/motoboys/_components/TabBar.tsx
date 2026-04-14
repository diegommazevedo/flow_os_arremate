"use client";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors"
          style={{
            color: active === t.key ? "var(--text-accent)" : "var(--text-tertiary)",
            borderBottom: active === t.key ? "2px solid var(--text-accent)" : "2px solid transparent",
          }}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs"
              style={{ background: "var(--surface-hover)" }}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
