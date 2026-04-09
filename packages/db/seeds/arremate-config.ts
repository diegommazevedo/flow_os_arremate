/**
 * Seed idempotente: pipeline Arrematador + departamentos + tags de chat.
 * Escopo fixo [SEC-01]: todas as mutações usam `workspaceId` explícito.
 *
 * Uso:
 *   WORKSPACE_ID=<uuid> pnpm --filter @flow-os/db seed:arremate
 *   # ou: ARREMATE_WORKSPACE_ID, ou pnpm ... seed:arremate -- <uuid>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Faixa temporária para evitar colisão em @@unique([workspaceId, position]) ao renomear/reordenar. */
const POSITION_OFFSET = 1_000_000;

const ARREMATE_STAGES = [
  { name: "Triagem", color: "#64748b", isWon: false },
  { name: "Sem Acesso", color: "#475569", isWon: false },
  { name: "1º Contato", color: "#0f766e", isWon: false },
  { name: "Contratação", color: "#0ea5e9", isWon: false },
  { name: "ITBI", color: "#f59e0b", isWon: false },
  { name: "Registro de Imóvel", color: "#2563eb", isWon: false },
  { name: "Troca de Titularidade", color: "#ec4899", isWon: false },
  { name: "Envio Docs", color: "#06b6d4", isWon: false },
  { name: "Docs Enviados", color: "#14b8a6", isWon: false },
  { name: "Emissão de NF", color: "#f97316", isWon: false },
  { name: "Processo Concluído", color: "#22c55e", isWon: false },
  { name: "Arrematação", color: "#15803d", isWon: true },
] as const;

const ARREMATE_DEPARTAMENTOS = [
  "Contrato",
  "ITBI",
  "Registro",
  "Condomínio / Gestão",
  "Operações",
] as const;

const ARREMATE_TAGS = [
  { descricao: "Cliente não responde", corFundo: "#6b7280", corTexto: "#ffffff" },
  { descricao: "Inadimplente", corFundo: "#dc2626", corTexto: "#ffffff" },
  { descricao: "ITBI pendente", corFundo: "#f59e0b", corTexto: "#ffffff" },
  { descricao: "Docs ok", corFundo: "#22c55e", corTexto: "#ffffff" },
  { descricao: "Urgente", corFundo: "#e11d48", corTexto: "#ffffff" },
] as const;

function resolveWorkspaceId(): string {
  const fromEnv = process.env["WORKSPACE_ID"] ?? process.env["ARREMATE_WORKSPACE_ID"];
  const fromArgv = process.argv[2];
  const id = (fromEnv ?? fromArgv ?? "").trim();
  if (!id) {
    console.error(
      "Defina WORKSPACE_ID ou ARREMATE_WORKSPACE_ID, ou passe o uuid como argumento.",
    );
    process.exit(1);
  }
  return id;
}

async function main(): Promise<void> {
  const workspaceId = resolveWorkspaceId();

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId },
    select: { id: true, slug: true },
  });
  if (!ws) {
    console.error(`Workspace não encontrado: ${workspaceId}`);
    process.exit(1);
  }

  console.log(`Arremate seed → workspace ${ws.slug} (${ws.id})`);

  await prisma.$transaction(async (tx) => {
    const allStages = await tx.stage.findMany({
      where: { workspaceId },
      select: { id: true, position: true },
      orderBy: { id: "asc" },
    });

    let bump = 0;
    for (const s of allStages) {
      await tx.stage.updateMany({
        where: { id: s.id, workspaceId },
        data: { position: POSITION_OFFSET + bump },
      });
      bump += 1;
    }

    for (const [i, def] of ARREMATE_STAGES.entries()) {
      const position = i + 1;
      const slaDays = position <= 4 ? 7 : 15;
      const existing = await tx.stage.findFirst({
        where: { workspaceId, name: def.name },
        select: { id: true },
      });

      if (existing) {
        await tx.stage.updateMany({
          where: { id: existing.id, workspaceId },
          data: {
            position,
            color: def.color,
            isWon: def.isWon,
            isLost: false,
            slaDays,
          },
        });
      } else {
        await tx.stage.create({
          data: {
            workspaceId,
            name: def.name,
            position,
            color: def.color,
            isWon: def.isWon,
            isLost: false,
            slaDays,
          },
        });
      }
    }

    for (const nome of ARREMATE_DEPARTAMENTOS) {
      await tx.department.upsert({
        where: { workspaceId_nome: { workspaceId, nome } },
        update: { membros: [] },
        create: { workspaceId, nome, membros: [] },
      });
    }

    for (const [ordem, tag] of ARREMATE_TAGS.entries()) {
      await tx.chatTag.upsert({
        where: {
          workspaceId_descricao: { workspaceId, descricao: tag.descricao },
        },
        update: {
          corFundo: tag.corFundo,
          corTexto: tag.corTexto,
          ordem,
        },
        create: {
          workspaceId,
          descricao: tag.descricao,
          corFundo: tag.corFundo,
          corTexto: tag.corTexto,
          ordem,
        },
      });
    }
  });

  console.log(
    `OK: ${ARREMATE_STAGES.length} estágios (posições 1–${ARREMATE_STAGES.length}), ${ARREMATE_DEPARTAMENTOS.length} departamentos, ${ARREMATE_TAGS.length} tags.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
