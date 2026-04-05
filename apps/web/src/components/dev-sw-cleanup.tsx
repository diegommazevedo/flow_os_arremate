"use client";

import { useEffect } from "react";

/**
 * Em desenvolvimento, remove Service Workers e caches do Workbox.
 * Um `public/sw.js` de build antigo faz o browser pedir chunks `_next/static` que já não existem → 404.
 */
export function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env["NODE_ENV"] !== "development") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) void r.unregister();
    });

    if ("caches" in window) {
      void caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.includes("workbox") || k.includes("next-static") || k.startsWith("pages"))
            .map((k) => caches.delete(k)),
        ),
      );
    }
  }, []);

  return null;
}
