/**
 * Sugestão heurística de perfil — NÃO aplica sozinha; só metadado para o Bruno revisar.
 * Níveis alinhados a ProfileLevel: DOWN | STANDARD | UP (no máximo 1 de distância do neutro).
 */

import { db } from "@flow-os/db";
import type { ProfileLevel } from "@flow-os/db";

export interface ProfileSuggestion {
  suggestedLevel: "down" | "standard" | "up";
  confidence: number;
  reasons: string[];
  suggestedProfileId: string | null;
  autoApply: false;
}

function levelToEnum(s: "down" | "standard" | "up"): ProfileLevel {
  if (s === "down") return "DOWN";
  if (s === "up") return "UP";
  return "STANDARD";
}

export async function suggestMissionProfile(
  workspaceId: string,
  dealMeta: Record<string, unknown>,
): Promise<ProfileSuggestion> {
  const address = String(dealMeta["imovelEndereco"] ?? dealMeta["endereco"] ?? "").toLowerCase();
  const city = String(dealMeta["imovelCidade"] ?? dealMeta["cidade"] ?? "").toLowerCase();
  const notas = String(dealMeta["observacoes"] ?? dealMeta["notes"] ?? "").toLowerCase();
  const valor = Number(dealMeta["valorImovel"] ?? dealMeta["valorArrematacao"] ?? 0);

  const signals: { level: "up" | "down"; reason: string; weight: number }[] = [];

  const upKeywords = [
    "comunidade",
    "favela",
    "morro",
    "vila",
    "conjunto",
    "invasão",
    "ocupado",
    "ocupação",
    "irregular",
    "sem número",
    "estrada de terra",
    "zona rural",
    "sítio",
    "chácara",
    "fazenda",
    "ramal",
    "km ",
    "conflito",
    "tráfico",
    "milícia",
    "periferia",
    "palafita",
  ];
  for (const k of upKeywords) {
    if (address.includes(k) || notas.includes(k) || city.includes(k)) {
      const w = k === "tráfico" || k === "milícia" ? 0.9 : 0.55;
      signals.push({ level: "up", reason: `endereço/notas contém “${k}”`, weight: w });
    }
  }

  if (valor > 0 && valor < 80_000) {
    signals.push({ level: "up", reason: "valor estimado < R$ 80k", weight: 0.4 });
  }

  const downKeywords = [
    "centro",
    "jardim",
    "vila rica",
    "alphaville",
    "condomínio fechado",
    "alto padrão",
    "nobre",
    "residencial",
    "avenida paulista",
    "beira mar",
  ];
  for (const k of downKeywords) {
    if (address.includes(k) || city.includes(k)) {
      signals.push({ level: "down", reason: `endereço/cidade contém “${k}”`, weight: 0.5 });
    }
  }

  if (valor > 500_000) {
    signals.push({ level: "down", reason: "valor estimado > R$ 500k", weight: 0.45 });
  }

  const upScore = signals.filter((s) => s.level === "up").reduce((a, s) => a + s.weight, 0);
  const downScore = signals.filter((s) => s.level === "down").reduce((a, s) => a + s.weight, 0);

  let level: "up" | "down" | "standard" = "standard";
  let confidence = 0.35;
  const reasons: string[] = [];

  if (upScore > downScore && upScore >= 0.5) {
    level = "up";
    confidence = Math.min(upScore / 2.2, 0.95);
    signals.filter((s) => s.level === "up").forEach((s) => reasons.push(s.reason));
  } else if (downScore > upScore && downScore >= 0.5) {
    level = "down";
    confidence = Math.min(downScore / 2.2, 0.95);
    signals.filter((s) => s.level === "down").forEach((s) => reasons.push(s.reason));
  }

  const profiles = await db.missionProfile.findMany({
    where: { workspaceId, isActive: true },
  });
  const want = levelToEnum(level);
  const profile =
    profiles.find((p) => p.level === want) ??
    profiles.find((p) => p.isDefault) ??
    profiles[0] ??
    null;

  return {
    suggestedLevel: level,
    confidence,
    reasons: [...new Set(reasons)].slice(0, 5),
    suggestedProfileId: profile?.id ?? null,
    autoApply: false,
  };
}
