/**
 * Vistoria Token — verifica pwaAccessToken do FieldAssignment.
 *
 * O projeto usa pwaAccessToken (cuid gerado no create) em vez de HMAC.
 * Este módulo centraliza a verificação para uso tanto no brain quanto no web.
 *
 * [SEC-08] Token opaco — não expõe workspaceId nem assignmentId.
 */

import { db } from "@flow-os/db";

export interface TokenVerification {
  valid: boolean;
  expired: boolean;
  assignmentId: string;
  workspaceId: string;
  status: string;
  profileId: string | null;
}

const INVALID: TokenVerification = {
  valid: false,
  expired: false,
  assignmentId: "",
  workspaceId: "",
  status: "",
  profileId: null,
};

/**
 * Verifica pwaAccessToken e retorna dados do assignment.
 * Considera expirado se deadlineHours do profile ultrapassado desde contactedAt.
 */
export async function verifyVistoriaToken(
  token: string,
): Promise<TokenVerification> {
  if (!token || token.length < 8) return INVALID;

  const assignment = await db.fieldAssignment.findFirst({
    where: { pwaAccessToken: token },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      profileId: true,
      contactedAt: true,
      profile: { select: { deadlineHours: true } },
    },
  });

  if (!assignment) return INVALID;

  // Verificar expiração baseada no deadlineHours do profile
  const deadlineHours = assignment.profile?.deadlineHours ?? 48;
  const contactedAt = assignment.contactedAt ?? new Date();
  const elapsed = Date.now() - contactedAt.getTime();
  const expired = elapsed > deadlineHours * 3600 * 1000;

  return {
    valid: true,
    expired,
    assignmentId: assignment.id,
    workspaceId: assignment.workspaceId,
    status: assignment.status,
    profileId: assignment.profileId,
  };
}

/**
 * Gera URL pública de vistoria para o motoboy.
 */
export function buildVistoriaUrl(pwaAccessToken: string): string {
  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3030";
  return `${baseUrl}/vistoria/${pwaAccessToken}`;
}
