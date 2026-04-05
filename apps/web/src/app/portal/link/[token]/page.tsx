/**
 * /portal/link/[token] — Magic Link Validator
 *
 * Fluxo:
 *   GET /portal/link/eyJ... → verifica JWT → renderiza MagicLinkGate
 *   MagicLinkGate chama Server Action → cria cookie httpOnly → redireciona para /portal/[dealId]
 */

import type { Metadata } from "next";
import Link from "next/link";
import { verifyPortalToken } from "@/lib/portal-auth";
import { MagicLinkGate } from "./_components/MagicLinkGate";

export const metadata: Metadata = {
  title: "Acessando Portal — Arrematador Caixa",
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function MagicLinkPage({ params }: Props) {
  const { token } = await params;

  const result = await verifyPortalToken(token);

  if (!result.valid) {
    return <InvalidLinkScreen reason={result.reason} />;
  }

  const { dealId, actorId, actorName } = result.payload;

  return (
    <MagicLinkGate
      dealId={dealId}
      actorId={actorId}
      actorName={actorName}
      token={token}
    />
  );
}

// ─── Tela de link inválido ────────────────────────────────────────────────────

function InvalidLinkScreen({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🔒</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Link inválido ou expirado
        </h1>
        <p className="text-gray-500 text-base mb-2">
          {reason === "Link expirado"
            ? "Este link de acesso já expirou. Links são válidos por 24 horas."
            : "Não foi possível validar este link de acesso."}
        </p>
        <p className="text-gray-500 text-base mb-8">
          Solicite um novo link ao seu consultor responsável.
        </p>

        <a
          href="https://wa.me/5511999999999"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl text-base transition-colors min-h-[44px] w-full"
        >
          <WhatsAppIcon />
          Falar com meu consultor
        </a>

        <p className="mt-6 text-sm text-gray-400">
          Código do erro:{" "}
          <code className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
            {reason}
          </code>
        </p>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

void Link;
