/**
 * Resolve MissionProfile ativo para um deal (regras autoSelect + padrão).
 * O dispatcher usa este resultado — não chama IA.
 * [SEC-03] workspaceId em todas as queries.
 */

import { db } from "@flow-os/db";
import type { MissionProfile } from "@flow-os/db";

export interface AutoSelectRules {
  ufs?: string[];
  cities?: string[];
  keywords?: string[];
  priority?: number;
}

function parseRules(raw: unknown): AutoSelectRules {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    ufs: Array.isArray(o["ufs"]) ? (o["ufs"] as string[]).map((u) => u.toUpperCase()) : [],
    cities: Array.isArray(o["cities"]) ? (o["cities"] as string[]).map((c) => String(c).toLowerCase()) : [],
    keywords: Array.isArray(o["keywords"]) ? (o["keywords"] as string[]).map((k) => String(k).toLowerCase()) : [],
    priority: typeof o["priority"] === "number" ? o["priority"] : 100,
  };
}

function matchesRules(
  dealMeta: Record<string, unknown>,
  rules: AutoSelectRules,
): boolean {
  const addr = String(dealMeta["imovelEndereco"] ?? dealMeta["endereco"] ?? "").toLowerCase();
  const city = String(dealMeta["imovelCidade"] ?? dealMeta["cidade"] ?? "").toLowerCase();
  const uf = String(dealMeta["imovelUF"] ?? dealMeta["uf"] ?? "").toUpperCase();

  if (rules.ufs && rules.ufs.length > 0 && !rules.ufs.includes(uf)) return false;
  if (rules.cities && rules.cities.length > 0) {
    const hit = rules.cities.some((c) => city.includes(c) || c === city);
    if (!hit) return false;
  }
  if (rules.keywords && rules.keywords.length > 0) {
    const hitKw = rules.keywords.some((k) => k && (addr.includes(k) || city.includes(k)));
    if (!hitKw) return false;
  }
  return (rules.ufs?.length ?? 0) > 0 || (rules.cities?.length ?? 0) > 0 || (rules.keywords?.length ?? 0) > 0;
}

/** Perfil para despacho: auto-select ou padrão ativo. */
export async function resolveMissionProfileForDeal(
  workspaceId: string,
  dealMeta: Record<string, unknown>,
): Promise<MissionProfile | null> {
  const profiles = await db.missionProfile.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (profiles.length === 0) return null;

  const scored = profiles
    .map((p) => {
      const rules = parseRules(p.autoSelectRules);
      const match = matchesRules(dealMeta, rules);
      return { p, match, priority: rules.priority ?? 100 };
    })
    .filter((x) => x.match)
    .sort((a, b) => a.priority - b.priority);

  if (scored[0]) return scored[0].p;

  const def = profiles.find((p) => p.isDefault);
  return def ?? profiles.find((p) => p.level === "STANDARD") ?? profiles[0] ?? null;
}

/** Valor combinado (reais) — teto com max do perfil e piso com bandeirada. */
export function priceAgreedFromProfile(
  agentPricePerVisit: number,
  profile: MissionProfile | null,
): number {
  if (!profile) return agentPricePerVisit;
  const floor = profile.bandeiradaValue / 100;
  const cap = profile.maxValue / 100;
  const base = Math.max(agentPricePerVisit, floor);
  return Math.min(base, cap);
}

export function effectiveAgentLimit(
  workflowLimit: number,
  profile: MissionProfile | null,
): number {
  if (!profile) return workflowLimit;
  return Math.min(Math.max(1, profile.agentLimit), Math.max(1, workflowLimit));
}

export function effectiveFollowupMs(
  workflowMs: number,
  profile: MissionProfile | null,
): number {
  if (!profile) return workflowMs;
  return profile.followupDelayMs > 0 ? profile.followupDelayMs : workflowMs;
}

export function effectiveDeadlineHours(
  workflowHours: number,
  profile: MissionProfile | null,
): number {
  if (!profile) return workflowHours;
  return profile.deadlineHours > 0 ? profile.deadlineHours : workflowHours;
}
