"use client";

/**
 * MagicLinkGate — Client Component
 * Chama Server Action para criar session cookie, depois redireciona.
 */

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activatePortalSession } from "../_actions/activate-session";

interface Props {
  dealId:    string;
  actorId:   string;
  actorName: string;
  token:     string;
}

export function MagicLinkGate({ dealId, actorId, actorName, token }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await activatePortalSession({ dealId, actorId, actorName, token });
      if (result.ok) {
        router.replace(`/portal/${dealId}`);
      } else {
        router.replace(`/portal/erro?motivo=${encodeURIComponent(result.reason)}`);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-2xl">🏠</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Acessando seu portal
        </h1>
        <p className="text-gray-500 text-base mb-8">
          Aguarde um momento, estamos preparando tudo para você...
        </p>

        <div className="flex items-center justify-center gap-2 text-blue-600">
          {isPending && (
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          <span className="text-base font-medium">Validando acesso seguro...</span>
        </div>
      </div>
    </div>
  );
}
