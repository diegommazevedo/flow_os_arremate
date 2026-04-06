"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { DevServiceWorkerCleanup } from "@/components/dev-sw-cleanup";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "operational", "chromatic"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      <DevServiceWorkerCleanup />
      {children}
    </ThemeProvider>
  );
}
