/**
 * Checklist padrão Gate B — P-02 em DossierChecklist.items (Json).
 */

import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";

export interface ChecklistItemRow {
  id: string;
  label: string;
  required: boolean;
  status: "pending" | "uploaded" | "processing" | "done" | "error";
  fileUrl?: string;
  doneBy?: string;
  extractedData?: unknown;
}

export const DEFAULT_DOSSIER_CHECKLIST_ITEMS: ChecklistItemRow[] = [
  { id: "matricula", label: "Matrícula do imóvel", required: true, status: "pending" },
  { id: "onus_reais", label: "Certidão de ônus reais", required: true, status: "pending" },
  { id: "certidao_acoes", label: "Certidão de ações", required: false, status: "pending" },
  { id: "debitos_municipais", label: "Débitos municipais", required: true, status: "pending" },
  { id: "situacao_condominio", label: "Situação condominial", required: false, status: "pending" },
  { id: "itbi_estimado", label: "ITBI estimado", required: false, status: "pending" },
  { id: "extrato_fgts", label: "Extrato FGTS", required: false, status: "pending" },
];

export async function ensureDossierChecklist(workspaceId: string, dossierId: string): Promise<void> {
  const existing = await db.dossierChecklist.findUnique({
    where: { dossierId },
    select: { id: true },
  });
  if (existing) return;

  await db.dossierChecklist.create({
    data: {
      workspaceId,
      dossierId,
      items: DEFAULT_DOSSIER_CHECKLIST_ITEMS as unknown as Prisma.InputJsonValue,
      gateB: false,
    },
  });
}
