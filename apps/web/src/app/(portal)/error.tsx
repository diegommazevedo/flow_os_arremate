"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary do segmento (portal) — evita “tela preta” muda em falhas RSC/página.
 * Mensagem genérica em produção; detalhe só em dev no cliente.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal/error]", error);
  }, [error]);

  const isDev = process.env["NODE_ENV"] === "development";

  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center"
      role="alert"
    >
      <h1 className="text-xl font-semibold text-white">Algo falhou nesta área do portal</h1>
      <p className="max-w-md text-sm text-gray-400">
        Tenta de novo abaixo. Se continuar, recarrega a página (Ctrl+Shift+R) ou volta ao
        dashboard. Para suporte, envia o código <span className="font-mono">digest</span>{" "}
        se aparecer.
      </p>
      {isDev ? (
        <pre className="max-w-lg overflow-auto rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-left text-xs text-red-400/90">
          {error.message}
        </pre>
      ) : null}
      {error.digest ? (
        <p className="font-mono text-xs text-gray-500">digest: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Tentar de novo
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          Ir ao dashboard
        </Link>
      </div>
    </div>
  );
}
