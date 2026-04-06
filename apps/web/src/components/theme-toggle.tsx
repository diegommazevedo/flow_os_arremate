"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const THEME_ORDER = ["dark", "operational", "chromatic"] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;

  const current = THEME_ORDER.includes(theme as (typeof THEME_ORDER)[number])
    ? (theme as (typeof THEME_ORDER)[number])
    : "dark";

  const cycle = () => {
    const i = THEME_ORDER.indexOf(current);
    const idx = (i < 0 ? 0 : i + 1) % THEME_ORDER.length;
    const next: (typeof THEME_ORDER)[number] = THEME_ORDER[idx]!;
    setTheme(next);
  };

  const icon =
    current === "chromatic" ? "🎨" : current === "operational" ? "☀" : "☾";
  const title =
    current === "chromatic"
      ? "Tema Chromatic — próximo: escuro"
      : current === "operational"
        ? "Tema operacional — próximo: Chromatic"
        : "Tema escuro — próximo: operacional";

  return (
    <button
      type="button"
      onClick={cycle}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-lg
                 text-gray-400 hover:bg-gray-800 hover:text-white
                 transition-colors"
    >
      <span className="text-base leading-none" aria-hidden>
        {icon}
      </span>
    </button>
  );
}
