import { PrismaClient, type Prisma } from "@prisma/client";
import type { StageId } from "@flow-os/templates";

type PhaseMigrationAction = "MIGRATE" | "SKIP_ALREADY_SET" | "ABORT_UNMAPPED_PHASE";

interface PhaseMigrationRow {
  dealId: string;
  currentPhase: string;
  resolvedStageId: StageId | null;
  stageIdBefore: string | null;
  action: PhaseMigrationAction;
  reason: string;
}

interface PhaseMigrationReport {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  totalDealsScanned: number;
  mappedCount: number;
  alreadyMigratedCount: number;
  unmappedCount: number;
  rows: PhaseMigrationRow[];
}

const LEGACY_PHASE_MAP: Record<string, StageId> = {
  "proposta recebida": "captado",
  "iniciar fluxo": "triagem",
  "grupo nao criado": "sem_acesso_grupo",
  "cliente nao entrou": "primeiro_contato",
  "contratacao": "fgts_contratacao",
  "boleto pago": "boleto_pago_gate",
  "relatorio enviado": "envio_docs_cef",
  "aguardando decisao": "docs_aguardando_cef",
  "itbi": "itbi",
  "triagem": "triagem",
};

function normalizeLegacyPhase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function resolveStageFromLegacyPhase(currentPhase: string): StageId | null {
  return LEGACY_PHASE_MAP[normalizeLegacyPhase(currentPhase)] ?? null;
}

async function resolveWorkspace(
  db: PrismaClient,
  workspaceId?: string,
  workspaceSlug?: string,
): Promise<{ id: string; name: string; slug: string }> {
  if (workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true },
    });
    if (!workspace) throw new Error(`Workspace ${workspaceId} não encontrado.`);
    return workspace;
  }

  const workspace = await db.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!workspace) throw new Error(`Workspace slug=${workspaceSlug} não encontrado.`);
  return workspace;
}

async function ensurePhaseMigrationAgent(db: PrismaClient, workspaceId: string): Promise<string> {
  const existing = await db.agent.findFirst({
    where: { workspaceId, name: "System Phase Migration" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.agent.create({
    data: {
      workspaceId,
      name: "System Phase Migration",
      persona: "Agente técnico para auditoria de migração de fases legadas.",
      skills: ["deal.phase_migration"],
      meta: { source: "migrate-pipedrive.ts", mode: "phase-migration" },
    },
    select: { id: true },
  });

  return created.id;
}

async function buildPhaseMigrationReport(
  db: PrismaClient,
  workspace: { id: string; name: string; slug: string },
): Promise<PhaseMigrationReport> {
  const deals = await db.deal.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, workspaceId: true, meta: true },
    orderBy: { createdAt: "asc" },
  });

  const rows: PhaseMigrationRow[] = [];

  for (const deal of deals) {
    const meta = (deal.meta ?? {}) as Record<string, unknown>;
    const currentPhase = typeof meta["currentPhase"] === "string" ? meta["currentPhase"] : "";
    const stageIdBefore = typeof meta["stageId"] === "string" ? meta["stageId"] : null;

    if (stageIdBefore) {
      rows.push({
        dealId: deal.id,
        currentPhase,
        resolvedStageId: resolveStageFromLegacyPhase(currentPhase),
        stageIdBefore,
        action: "SKIP_ALREADY_SET",
        reason: "meta.stageId já preenchido",
      });
      continue;
    }

    const resolvedStageId = resolveStageFromLegacyPhase(currentPhase);
    if (!resolvedStageId) {
      rows.push({
        dealId: deal.id,
        currentPhase,
        resolvedStageId: null,
        stageIdBefore,
        action: "ABORT_UNMAPPED_PHASE",
        reason: "meta.currentPhase fora do LEGACY_PHASE_MAP",
      });
      continue;
    }

    rows.push({
      dealId: deal.id,
      currentPhase,
      resolvedStageId,
      stageIdBefore,
      action: "MIGRATE",
      reason: "mapeamento legado válido",
    });
  }

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    totalDealsScanned: rows.length,
    mappedCount: rows.filter((r) => r.action === "MIGRATE").length,
    alreadyMigratedCount: rows.filter((r) => r.action === "SKIP_ALREADY_SET").length,
    unmappedCount: rows.filter((r) => r.action === "ABORT_UNMAPPED_PHASE").length,
    rows,
  };
}

export async function runPhaseMigration(params: {
  workspaceId?: string;
  workspaceSlug?: string;
  dryRun: boolean;
}): Promise<void> {
  const db = new PrismaClient({ log: ["error"] });
  try {
    const workspace = await resolveWorkspace(db, params.workspaceId, params.workspaceSlug);
    const report = await buildPhaseMigrationReport(db, workspace);

    console.log(JSON.stringify(report, null, 2));

    if (report.unmappedCount > 0) {
      throw new Error(`ABORT: ${report.unmappedCount} fase(s) não mapeada(s).`);
    }

    if (params.dryRun) return;

    const agentId = await ensurePhaseMigrationAgent(db, workspace.id);

    for (const row of report.rows) {
      if (row.action !== "MIGRATE" || !row.resolvedStageId) continue;

      // SEC-03: valida ownership por workspace antes do update.
      const deal = await db.deal.findFirst({
        where: { id: row.dealId, workspaceId: workspace.id },
        select: { id: true, workspaceId: true, meta: true },
      });
      if (!deal) throw new Error(`Deal ${row.dealId} não pertence ao workspace ${workspace.id}.`);

      const currentMeta = (deal.meta ?? {}) as Record<string, unknown>;
      if (typeof currentMeta["stageId"] === "string" && currentMeta["stageId"]) continue;

      // Merge cirúrgico em JSON para não perder campos existentes.
      const nextMeta: Prisma.InputJsonObject = {
        ...currentMeta,
        stageId: row.resolvedStageId,
      };

      await db.deal.update({
        where: { id: deal.id },
        data: { meta: nextMeta },
        select: { id: true },
      });

      await db.agentAuditLog.create({
        data: {
          workspaceId: workspace.id,
          agentId,
          action: "PHASE_MIGRATION",
          input: {
            dealId: deal.id,
            fromCurrentPhase: row.currentPhase,
            stageIdBefore: row.stageIdBefore,
          },
          output: {
            toStageId: row.resolvedStageId,
            migratedAt: new Date().toISOString(),
          },
          modelUsed: "none",
          tokensUsed: 0,
          costUsd: 0,
          durationMs: 0,
          success: true,
        },
        select: { id: true },
      });
    }

    const postDeals = await db.deal.findMany({
      where: { workspaceId: workspace.id },
      select: { meta: true },
    });
    const remainingNullStageId = postDeals.filter((deal) => {
      const meta = (deal.meta ?? {}) as Record<string, unknown>;
      return typeof meta["currentPhase"] === "string" && !meta["stageId"];
    }).length;

    console.log(
      JSON.stringify(
        {
          workspaceId: workspace.id,
          migrated: report.mappedCount,
          alreadySet: report.alreadyMigratedCount,
          remainingNullStageId,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

