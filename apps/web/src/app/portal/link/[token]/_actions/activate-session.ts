"use server";

/**
 * Server Action: ativa a session cookie após validação do magic link.
 * Separado do MagicLinkGate para que cookies() seja chamado no contexto correto.
 */

import { createPortalSession } from "@/lib/portal-auth";

interface ActivateParams {
  dealId:    string;
  actorId:   string;
  actorName: string;
  token:     string; // não é usado aqui — já foi validado no Server Component pai
}

export async function activatePortalSession(
  params: ActivateParams,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await createPortalSession({
      dealId:    params.dealId,
      actorId:   params.actorId,
      actorName: params.actorName,
    });
    return { ok: true };
  } catch (err) {
    console.error("[portal] Falha ao criar sessão:", err);
    return { ok: false, reason: "Não foi possível criar sessão" };
  }
}
