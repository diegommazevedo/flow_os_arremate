"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Evita hydration mismatch — só renderiza após montar no cliente
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="flex h-8 w-8 items-center justify-center rounded-lg
                 text-gray-400 hover:bg-gray-800 hover:text-white
                 transition-colors"
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}
