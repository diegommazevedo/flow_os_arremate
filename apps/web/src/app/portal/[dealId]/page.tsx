/**
 * /portal/[dealId] — Portal do cliente (arrematante)
 *
 * Auth: verifica session cookie httpOnly antes de renderizar.
 * Dados: Server Component com Suspense por seção.
 * UX:   Mobile-first, fonte 16px+, botões 44px+, linguagem humana.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal-auth";
import { getPortalDealData } from "./_lib/portal-queries";
import { PortalHeader }       from "./_components/PortalHeader";
import { PhaseStepper }       from "./_components/PhaseStepper";
import { NextStepCard }       from "./_components/NextStepCard";
import { DocumentChecklist }  from "./_components/DocumentChecklist";
import { DealChat }           from "./_components/DealChat";
import { DealTimeline }       from "./_components/DealTimeline";
import { PortalSkeleton }     from "./_components/PortalSkeleton";

export const metadata: Metadata = {
  title: "Meu Imóvel — Arrematador Caixa",
  description: "Acompanhe todas as etapas do seu imóvel em um só lugar",
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ dealId: string }>;
}

export default async function PortalPage({ params }: Props) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const session = await getPortalSession();
  if (!session.ok) {
    redirect("/portal/acesso-negado");
  }

  const { dealId } = await params;

  // Garante que a session corresponde ao dealId solicitado
  if (session.session.dealId !== dealId) {
    redirect("/portal/acesso-negado");
  }

  // ── Carregar dados ────────────────────────────────────────────────────────
  const data = await getPortalDealData(dealId, session.session.actorId);

  if (!data) {
    return <DealNotFound />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* PWA: meta viewport para mobile */}
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

      {/* Header fixo */}
      <PortalHeader
        actorName={data.actor.name}
        corretorPhone={data.responsible.phone}
        corretorName={data.responsible.name}
      />

      {/* Conteúdo principal com espaço para o header fixo */}
      <main className="pt-[72px] pb-24 max-w-2xl mx-auto px-4">

        {/* ① Stepper de fases */}
        <section className="mt-4 mb-6" aria-label="Fases do processo">
          <Suspense fallback={<PortalSkeleton variant="stepper" />}>
            <PhaseStepper
              phases={data.phases}
              currentPhase={data.currentPhase}
              imovelLabel={`${data.deal.imovelCidade} — ${data.deal.imovelUF}`}
              etapaLabel={data.deal.etapaLabel}
            />
          </Suspense>
        </section>

        {/* ② Card "Próximo passo" */}
        {data.nextStep && (
          <section className="mb-6" aria-label="Próximo passo">
            <Suspense fallback={<PortalSkeleton variant="next-step" />}>
              <NextStepCard nextStep={data.nextStep} />
            </Suspense>
          </section>
        )}

        {/* ③ Checklist de documentos */}
        <section className="mb-6" aria-label="Documentos necessários">
          <SectionTitle icon="📎" title="Seus documentos" />
          <Suspense fallback={<PortalSkeleton variant="list" rows={4} />}>
            <DocumentChecklist
              documents={data.documents}
              dealId={dealId}
            />
          </Suspense>
        </section>

        {/* ④ Chat com a equipe */}
        <section className="mb-6" aria-label="Chat com o time">
          <SectionTitle icon="💬" title="Fale com sua equipe" />
          <Suspense fallback={<PortalSkeleton variant="chat" />}>
            <DealChat
              rocketRoomId={data.deal.rocketRoomId}
              corretorPhone={data.responsible.phone}
            />
          </Suspense>
        </section>

        {/* ⑤ Timeline */}
        <section className="mb-6" aria-label="Histórico do processo">
          <SectionTitle icon="📅" title="Histórico" />
          <Suspense fallback={<PortalSkeleton variant="list" rows={3} />}>
            <DealTimeline events={data.timeline} />
          </Suspense>
        </section>

      </main>

      {/* FAB de ajuda — sempre visível */}
      <HelpFab corretorPhone={data.responsible.phone} />
    </div>
  );
}

// ─── Sub-componentes de layout ────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xl" aria-hidden>{icon}</span>
      <h2 className="text-lg font-bold text-gray-800">{title}</h2>
    </div>
  );
}

/**
 * Botão flutuante de ajuda via WhatsApp — sempre visível no canto inferior.
 */
function HelpFab({ corretorPhone }: { corretorPhone: string }) {
  const phone = corretorPhone.replace(/\D/g, "") || "5511999999999";
  const msg   = encodeURIComponent("Olá! Preciso de ajuda com meu processo de arrematação.");

  return (
    <a
      href={`https://wa.me/${phone}?text=${msg}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-4 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-3 rounded-2xl shadow-lg shadow-green-900/30 transition-all active:scale-95 min-h-[52px]"
      aria-label="Falar com consultor no WhatsApp"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current flex-shrink-0" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
      <span className="text-sm">Preciso de ajuda</span>
    </a>
  );
}

// ─── Tela de deal não encontrado ──────────────────────────────────────────────

function DealNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🏠</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Processo não encontrado
        </h1>
        <p className="text-gray-500 text-base">
          Não encontramos as informações do seu processo.
          Entre em contato com sua equipe de assessoria.
        </p>
      </div>
    </div>
  );
}
