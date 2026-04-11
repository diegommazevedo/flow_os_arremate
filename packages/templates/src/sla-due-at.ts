import { PIPELINE_MASTER_CONFIG } from "./real_estate_caixa";
import type { PipelineMasterStage, StageId } from "./real_estate_caixa";

const AMERICA_SAO_PAULO = "America/Sao_Paulo";
const SP_WALL_OFFSET = "-03:00";

export interface ComputeDueAtInput {
  stageId: StageId;
  enteredAt: Date;
  stage?: PipelineMasterStage | null;
  calendar?: { isBusinessDay(d: Date): boolean };
  /** GAP-02 — deadline externo com prioridade absoluta. */
  externalDeadline?: string | null;
}

export interface ComputeDueAtResult {
  dueAt: Date | null;
  basis: "externalDeadline" | "slaHours" | "slaBusinessDays" | "none";
  stageId: StageId;
}

/** ISO / string parseável → Date; inválido → null. */
function dueAtFromLimiteBoletoPagamento(raw: string | undefined | null): Date | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** v1: sábado/domingo no fuso America/Sao_Paulo (feriados = v2). */
export function defaultBrazilWeekendCalendar(): { isBusinessDay(d: Date): boolean } {
  return {
    isBusinessDay(d: Date): boolean {
      const w = new Intl.DateTimeFormat("en-US", {
        timeZone: AMERICA_SAO_PAULO,
        weekday: "short",
      }).format(d);
      return w !== "Sat" && w !== "Sun";
    },
  };
}

function resolveStage(stageId: StageId, stage?: PipelineMasterStage | null): PipelineMasterStage | null {
  if (stage) return stage;
  return PIPELINE_MASTER_CONFIG.stages.find((s) => s.id === stageId) ?? null;
}

/** YYYY-MM-DD do instante `d` em America/Sao_Paulo. */
function toYmdSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AMERICA_SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Avança um dia civil no calendário de SP (BR sem DST desde 2019 → -03:00). */
function addOneCalendarDayYmd(ymd: string): string {
  const anchor = new Date(`${ymd}T12:00:00${SP_WALL_OFFSET}`);
  anchor.setUTCDate(anchor.getUTCDate() + 1);
  return toYmdSaoPaulo(anchor);
}

/** Fim do dia civil `ymd` em SP (23:59:59.999 local -03). */
function endOfDaySaoPaulo(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999${SP_WALL_OFFSET}`);
}

function addBusinessDaysSaoPaulo(
  enteredAt: Date,
  businessDays: number,
  isBusinessDay: (d: Date) => boolean,
): Date {
  let ymd = toYmdSaoPaulo(enteredAt);
  let remaining = businessDays;

  while (remaining > 0) {
    const noon = new Date(`${ymd}T12:00:00${SP_WALL_OFFSET}`);
    if (isBusinessDay(noon)) {
      remaining -= 1;
    }
    if (remaining > 0) {
      ymd = addOneCalendarDayYmd(ymd);
    }
  }

  return endOfDaySaoPaulo(ymd);
}

/**
 * Calcula o vencimento de SLA para a etapa canónica, em função de slaHours ou slaBusinessDays.
 * Não grava em base nem lê workspaceId (SEC-03 fica no call site).
 */
export function computeDueAt(input: ComputeDueAtInput): ComputeDueAtResult {
  const { stageId, enteredAt, stage: stageArg, calendar, externalDeadline } = input;
  const stage = resolveStage(stageId, stageArg);
  const isBusinessDay = calendar?.isBusinessDay ?? defaultBrazilWeekendCalendar().isBusinessDay;

  const external = dueAtFromLimiteBoletoPagamento(externalDeadline ?? null);
  if (external) {
    return { dueAt: external, basis: "externalDeadline", stageId };
  }

  if (!stage) {
    return { dueAt: null, basis: "none", stageId };
  }

  const hasHours = typeof stage.slaHours === "number";
  const hasBusinessDays = typeof stage.slaBusinessDays === "number";

  if (hasHours) {
    const ms = enteredAt.getTime() + stage.slaHours! * 3_600_000;
    return { dueAt: new Date(ms), basis: "slaHours", stageId };
  }

  if (hasBusinessDays) {
    const dueAt = addBusinessDaysSaoPaulo(enteredAt, stage.slaBusinessDays!, isBusinessDay);
    return { dueAt, basis: "slaBusinessDays", stageId };
  }

  return { dueAt: null, basis: "none", stageId };
}
