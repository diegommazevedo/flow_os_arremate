import Link from "next/link";
import type { ReactNode } from "react";

const SETTINGS_NAV = [
  { href: "/settings",                    label: "Geral" },
  { href: "/settings/integrations",       label: "Integrações" },
  { href: "/settings/departamentos",      label: "Departamentos" },
  { href: "/settings/tags",               label: "Tags" },
  { href: "/settings/respostas-rapidas",  label: "Respostas Rápidas" },
] as const;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-6">
      {/* Sub-nav */}
      <nav className="w-44 shrink-0">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 px-2">Configurações</p>
        <ul className="space-y-0.5">
          {SETTINGS_NAV.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Page content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
