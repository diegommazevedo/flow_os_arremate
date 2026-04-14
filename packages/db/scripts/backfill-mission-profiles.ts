/**
 * One-off: cria os 4 MissionProfile padrão em workspaces que ainda não têm nenhum
 * (ex.: criados antes do bootstrap de perfis).
 *
 * Uso (a partir da raiz do monorepo):
 *   pnpm --filter @flow-os/db exec tsx --tsconfig packages/db/tsconfig.json packages/db/scripts/backfill-mission-profiles.ts
 *
 * Requer DATABASE_URL (ou .env carregado pelo shell).
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const db = new PrismaClient();

const ITEMS_JSON: Prisma.InputJsonValue = [
  { id: "audio", label: "Áudio descrição", required: true, enabled: true, baseValue: 0, bonusValue: 0, skipAllowed: false, order: 0 },
  { id: "text", label: "Texto livre", required: true, enabled: true, baseValue: 0, bonusValue: 0, skipAllowed: false, order: 1 },
  { id: "fach", label: "Foto fachada", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 2 },
  { id: "viz", label: "Foto vizinhança", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 3 },
  { id: "acc", label: "Foto acesso", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 4 },
  { id: "vext", label: "Vídeo exterior", required: false, enabled: true, baseValue: 800, bonusValue: 0, skipAllowed: false, order: 5 },
  { id: "vint", label: "Vídeo interno", required: false, enabled: true, baseValue: 800, bonusValue: 2000, skipAllowed: false, order: 6 },
];

const DEFAULT_SKIP_REASONS = [
  "Área de risco",
  "Muro / tapume",
  "Vigilante impediu",
  "Chuva intensa",
  "Imóvel demolido",
];

const PROFILE_ROWS: Array<{
  name: string;
  level: "DOWN" | "STANDARD" | "UP";
  description: string;
  isDefault: boolean;
  bandeiradaValue: number;
  maxValue: number;
  skipPenalty: boolean;
  skipRequiresText: boolean;
  skipMaxItems?: number;
  autoSelectRules?: Prisma.InputJsonValue;
}> = [
  {
    name: "Missão Simplificada",
    level: "DOWN",
    description: "Imóvel de fácil acesso, zona tranquila, sem intercorrências esperadas",
    isDefault: false,
    bandeiradaValue: 3000,
    maxValue: 6000,
    skipPenalty: false,
    skipRequiresText: false,
  },
  {
    name: "Padrão",
    level: "STANDARD",
    description: "Perfil neutro — usado quando não há regra de auto-seleção",
    isDefault: true,
    bandeiradaValue: 4000,
    maxValue: 8000,
    skipPenalty: true,
    skipRequiresText: true,
  },
  {
    name: "Missão Complexa",
    level: "UP",
    description: "Área de risco, difícil acesso, ocupação ou zona remota",
    isDefault: false,
    bandeiradaValue: 5000,
    maxValue: 10000,
    skipPenalty: false,
    skipRequiresText: true,
    skipMaxItems: 5,
  },
  {
    name: "Área de Risco",
    level: "UP",
    description: "Match automático por palavras no endereço (favela, comunidade, morro)",
    isDefault: false,
    bandeiradaValue: 5000,
    maxValue: 10000,
    skipPenalty: false,
    skipRequiresText: true,
    skipMaxItems: 5,
    autoSelectRules: {
      keywords: ["favela", "comunidade", "morro", "tráfico", "milícia"],
      priority: 5,
    },
  },
];

async function main() {
  const workspaces = await db.workspace.findMany({ select: { id: true, name: true } });
  let seeded = 0;
  for (const ws of workspaces) {
    const n = await db.missionProfile.count({ where: { workspaceId: ws.id } });
    if (n > 0) continue;
    console.log(`Seeding mission profiles: ${ws.name ?? ws.id} (${ws.id})`);
    await db.$transaction(async (tx) => {
      for (const r of PROFILE_ROWS) {
        await tx.missionProfile.create({
          data: {
            workspaceId: ws.id,
            name: r.name,
            description: r.description,
            isDefault: r.isDefault,
            isActive: true,
            level: r.level,
            bandeiradaValue: r.bandeiradaValue,
            maxValue: r.maxValue,
            currency: "BRL",
            items: ITEMS_JSON,
            skipPenalty: r.skipPenalty,
            skipRequiresText: r.skipRequiresText,
            skipMinChars: 10,
            skipMaxItems: r.skipMaxItems ?? 3,
            skipReasons: [...DEFAULT_SKIP_REASONS],
            agentLimit: 3,
            followupDelayMs: 7_200_000,
            deadlineHours: 48,
            autoSelectRules: (r.autoSelectRules ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
    });
    seeded++;
  }
  console.log(`Concluído. Workspaces com seed aplicado: ${seeded}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
