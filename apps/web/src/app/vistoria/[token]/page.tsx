/**
 * /vistoria/[token] — página pública PWA (sem auth de sessão).
 * Valida pwaAccessToken, busca assignment + profile, renderiza VistoriaApp.
 */

import { db } from "@flow-os/db";
import { VistoriaApp } from "./_components/VistoriaApp";

type Props = { params: Promise<{ token: string }> };

export default async function VistoriaPage({ params }: Props) {
  const { token } = await params;

  if (!token || token.length < 8) {
    return <ErrorScreen message="Link inválido" detail="O link que você acessou não é válido." />;
  }

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    include: {
      deal: { select: { id: true, title: true, meta: true } },
      profile: true,
      agent: {
        include: { partner: { select: { name: true, phone: true, email: true } } },
      },
      evidences: { select: { description: true, mediaUrl: true, mimeType: true, aiAnalysis: true } },
    },
  });

  if (!assignment) {
    return <ErrorScreen message="Link inválido" detail="Nenhuma vistoria encontrada para este link." />;
  }

  const deadlineHours = assignment.profile?.deadlineHours ?? 48;
  const contactedAt = assignment.contactedAt ?? assignment.createdAt;
  const elapsed = Date.now() - contactedAt.getTime();
  if (elapsed > deadlineHours * 3600 * 1000) {
    return <ErrorScreen message="Link expirado" detail="O prazo para esta vistoria expirou. Entre em contato com a equipe." />;
  }

  if (assignment.status === "COMPLETED") {
    return <ErrorScreen message="Vistoria já enviada" detail="Esta vistoria já foi concluída. Obrigado!" success />;
  }

  const meta = (assignment.deal.meta ?? {}) as Record<string, unknown>;
  const imovel = {
    endereco: String(meta["imovelEndereco"] ?? meta["endereco"] ?? ""),
    cidade: String(meta["imovelCidade"] ?? meta["cidade"] ?? ""),
    uf: String(meta["imovelUF"] ?? meta["uf"] ?? ""),
  };

  const assignMeta = (assignment.meta ?? {}) as Record<string, unknown>;
  const confirmLocked = assignMeta["confirmLocked"] === true;
  const itemStatesMeta = (assignMeta["itemStates"] as Record<string, { status?: string; skipReason?: string; savedAt?: string }> | undefined) ?? {};
  const descricaoTexto = typeof assignMeta["descricaoTexto"] === "string" ? assignMeta["descricaoTexto"] : "";

  const phone = assignment.agent.partner.phone;
  const digits = (phone ?? "").replace(/\D/g, "");
  const phoneMasked = digits.length >= 4 ? `+55 ** ****-${digits.slice(-4)}` : null;
  const phoneConfirmAvailable = phoneMasked !== null;

  const evidenceByItem: Record<string, { mediaUrl: string; mimeType: string }> = {};
  for (const ev of assignment.evidences) {
    const aid = ev.aiAnalysis as Record<string, unknown> | null;
    const itemId =
      typeof ev.description === "string" && ev.description
        ? ev.description
        : typeof aid?.["itemId"] === "string"
          ? aid["itemId"]
          : "";
    if (itemId) {
      evidenceByItem[itemId] = { mediaUrl: ev.mediaUrl, mimeType: ev.mimeType };
    }
  }

  const agentProfile = assignment.agent;
  const evidenceItemIds = new Set(
    assignment.evidences
      .map(ev => {
        const aid = ev.aiAnalysis as Record<string, unknown> | null;
        if (typeof ev.description === "string" && ev.description) return ev.description;
        if (typeof aid?.["itemId"] === "string") return aid["itemId"] as string;
        return "";
      })
      .filter(Boolean),
  );
  let savedCount = evidenceItemIds.size;
  for (const [id, st] of Object.entries(itemStatesMeta)) {
    if (st?.status === "skipped" && !evidenceItemIds.has(id)) savedCount += 1;
  }
  if (descricaoTexto.trim().length > 0 && !evidenceItemIds.has("text")) savedCount += 1;

  const profile = assignment.profile
    ? {
        name: assignment.profile.name,
        level: assignment.profile.level,
        bandeiradaValue: assignment.profile.bandeiradaValue,
        maxValue: assignment.profile.maxValue,
        currency: assignment.profile.currency,
        items: assignment.profile.items as Array<{
          id: string;
          label: string;
          required: boolean;
          enabled: boolean;
          baseValue: number;
          bonusValue: number;
          skipAllowed: boolean;
          order: number;
        }>,
        skipPenalty: assignment.profile.skipPenalty,
        skipRequiresText: assignment.profile.skipRequiresText,
        skipMinChars: assignment.profile.skipMinChars,
        skipMaxItems: assignment.profile.skipMaxItems,
        skipReasons: assignment.profile.skipReasons,
        deadlineHours: assignment.profile.deadlineHours,
      }
    : null;

  return (
    <VistoriaApp
      token={token}
      assignmentId={assignment.id}
      agentName={assignment.agent.partner.name}
      phoneMasked={phoneMasked}
      phoneConfirmAvailable={phoneConfirmAvailable}
      confirmLocked={confirmLocked}
      itemStatesMeta={itemStatesMeta}
      evidenceByItem={evidenceByItem}
      descricaoTexto={descricaoTexto}
      savedProgressCount={savedCount}
      imovel={imovel}
      profile={profile}
      prefilledCpf={agentProfile.cpf ?? ""}
      prefilledEmail={assignment.agent.partner.email ?? ""}
      prefilledPixKey={agentProfile.pixKey ?? ""}
      prefilledPixKeyType={agentProfile.pixKeyType ?? "CPF"}
    />
  );
}

function ErrorScreen({ message, detail, success }: { message: string; detail: string; success?: boolean }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>{success ? "✅" : "⚠️"}</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{message}</h1>
      <p style={{ fontSize: 14, color: "#8B8B9E", maxWidth: 300 }}>{detail}</p>
    </div>
  );
}
