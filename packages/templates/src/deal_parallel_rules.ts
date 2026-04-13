/**
 * P-01 — processos paralelos condicionais (Condomínio, Averbação, Desocupação).
 * Não são stages lineares; estado desejado deriva do `Deal.meta`.
 */

export const DEAL_PARALLEL_TYPES = ["CONDOMINIO", "AVERBACAO", "DESOCUPACAO"] as const;
export type DealParallelTypeId = (typeof DEAL_PARALLEL_TYPES)[number];

export type ParallelActivation = "INACTIVE" | "PENDING";

function readCondominio(meta: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = meta["condominio"];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
}

/**
 * Indica se cada paralela se aplica ao deal (PENDING) ou não (INACTIVE).
 * - Condomínio: `hasCondominio === true` ou `condominio.possui === true`
 * - Averbação: `averbacao === 'A realizar'`
 * - Desocupação: `isOcupado === true`
 */
export function desiredParallelActivation(meta: Record<string, unknown>): Record<DealParallelTypeId, ParallelActivation> {
  const condominio = readCondominio(meta);
  const hasCondominio =
    meta["hasCondominio"] === true ||
    condominio?.["possui"] === true ||
    condominio?.["possui"] === "sim";

  return {
    CONDOMINIO: hasCondominio ? "PENDING" : "INACTIVE",
    AVERBACAO: meta["averbacao"] === "A realizar" ? "PENDING" : "INACTIVE",
    DESOCUPACAO: meta["isOcupado"] === true ? "PENDING" : "INACTIVE",
  };
}
