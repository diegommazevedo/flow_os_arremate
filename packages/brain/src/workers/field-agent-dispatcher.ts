/**
 * Field Agent Dispatcher — PARTE 3
 *
 * Seleciona os 3 motoboys mais adequados para um Deal e dispara
 * ChatFlow WA via Evolution API.
 *
 * [SEC-03] workspaceId obrigatório em todas as queries.
 * [SEC-06] AuditLog: FIELD_AGENT_CONTACTED.
 * [SEC-08] Endereço/nome sanitizados antes de envio via WA.
 * [P-01]  Regras de template ficam em packages/templates.
 * [P-02]  Endereço, cidade, UF ficam em Deal.meta.
 */

import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { evolutionApi } from "../providers/evolution-api";
import { resolveWorkflow, type ResolvedWorkflow } from "./field-workflow-resolver";
import { buildMessageFromTemplate } from "./field-agent-defaults";
import {
  effectiveAgentLimit,
  effectiveDeadlineHours,
  effectiveFollowupMs,
  priceAgreedFromProfile,
  resolveMissionProfileForDeal,
} from "./mission-profile-resolver";
import { ensureDossierChecklist } from "../lib/dossier-checklist-defaults";
import { buildVistoriaUrl } from "../lib/vistoria-token";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface DealMeta {
  imovelEndereco?: string;
  imovelCidade?: string;
  imovelUF?: string;
  cidade?: string;
  uf?: string;
  endereco?: string;
  [key: string]: unknown;
}

interface SelectedAgent {
  id: string;
  partnerId: string;
  pricePerVisit: number;
  partner: {
    id: string;
    name: string;
    phone: string | null;
  };
}

export interface DispatchResult {
  dealId: string;
  agentsContacted: number;
  assignments: string[];
  errors: string[];
}

// ── Seleção de agentes ─────────────────────────────────────────────────────

export async function selectAgents(
  workspaceId: string,
  cidade: string,
  uf: string,
  limit = 3,
): Promise<SelectedAgent[]> {
  const agents = await db.fieldAgentProfile.findMany({
    where: {
      workspaceId,
      availability: "AVAILABLE",
      OR: [
        { cities: { has: cidade } },
        { states: { has: uf } },
      ],
    },
    orderBy: [
      { avgRating: { sort: "desc", nulls: "last" } },
      { pricePerVisit: "asc" },
    ],
    take: limit,
    include: {
      partner: {
        select: { id: true, name: true, phone: true },
      },
    },
  });

  return agents.map((a) => ({
    id: a.id,
    partnerId: a.partnerId,
    pricePerVisit: Number(a.pricePerVisit),
    partner: a.partner,
  }));
}

// ── Mensagens do ChatFlow (deprecated — usar templates do DB) ─────────────
// Mantidas para backward-compat. Novas integrações devem usar buildMessageFromTemplate().

/** @deprecated Use buildMessageFromTemplate com template do resolver */
function buildMsg1(nome: string): string {
  const safeName = defaultSanitizer.clean(nome);
  return [
    `Olá ${safeName}! Tudo bem?`,
    "",
    "Sou da equipe do Arrematador Caixa. Temos um serviço rápido de vistoria disponível perto de você.",
    "",
    "Interessado em saber mais?",
  ].join("\n");
}

/** @deprecated Use buildMessageFromTemplate com template do resolver */
function buildMsg2(endereco: string, valor: number, prazoHoras: number): string {
  const safeEndereco = defaultSanitizer.clean(endereco);
  return [
    "Ótimo! Segue o endereço do imóvel:",
    "",
    `📍 ${safeEndereco}`,
    "",
    "Precisamos de:",
    "📸 3 fotos externas da fachada",
    "📸 2 fotos da rua/vizinhança",
    "🎥 1 vídeo curto (30s) da área",
    "🎙 Áudio descrevendo: estado aparente, acesso, segurança percebida",
    "",
    `Valor: R$ ${valor.toFixed(2)}`,
    `Prazo: até ${prazoHoras}h`,
    "",
    "Pode fazer?",
  ].join("\n");
}

/** @deprecated Use buildMessageFromTemplate com template do resolver */
function buildMsg3(): string {
  return [
    "Perfeito! Quando terminar, manda tudo aqui nessa conversa mesmo.",
    "",
    "Qualquer dúvida, pode perguntar 👍",
  ].join("\n");
}

// ── Resolução de instância Evolution ──────────────────────────────────────

async function resolveEvolutionInstance(workspaceId: string): Promise<string | null> {
  const integration = await db.workspaceIntegration.findFirst({
    where: {
      workspaceId,
      type: "WHATSAPP_EVOLUTION",
      status: "ACTIVE",
    },
    select: { config: true },
  });

  if (!integration?.config) return null;
  const cfg = integration.config as Record<string, unknown>;
  return (cfg["EVOLUTION_INSTANCE_NAME"] as string) ?? null;
}

// ── Audit helper ───────────────────────────────────────────────────────────

async function writeAudit(
  workspaceId: string,
  action: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): Promise<void> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!agent) return;

  await db.agentAuditLog.create({
    data: {
      workspaceId,
      agentId: agent.id,
      action,
      input: input as Record<string, string | number | boolean>,
      output: output as Record<string, string | number | boolean>,
      modelUsed: "none",
      tokensUsed: 0,
      costUsd: 0,
      durationMs: 0,
      success: true,
    },
  });
}

// ── Worker principal ──────────────────────────────────────────────────────

export async function dispatchFieldAgents(
  dealId: string,
  workspaceId: string,
): Promise<DispatchResult> {
  const result: DispatchResult = {
    dealId,
    agentsContacted: 0,
    assignments: [],
    errors: [],
  };

  // 1. Buscar Deal com meta [SEC-03]
  const deal = await db.deal.findFirst({
    where: { id: dealId, workspaceId },
    select: { id: true, workspaceId: true, meta: true, title: true },
  });

  if (!deal) {
    result.errors.push("Deal não encontrado");
    return result;
  }

  const meta = (deal.meta ?? {}) as DealMeta;
  const metaRecord = deal.meta as Record<string, unknown>;
  const cidade = meta.imovelCidade ?? meta.cidade ?? "";
  const uf = meta.imovelUF ?? meta.uf ?? "";
  const endereco = meta.endereco ?? `${cidade}/${uf}`;

  if (!uf) {
    result.errors.push("Deal sem UF definida em meta");
    return result;
  }

  // 2. Resolver workflow (DB ou fallback) + perfil de missão (auto-select / padrão)
  //
  // Camadas sem duplicar regra:
  // - resolveWorkflow() → baseline: agentLimit, followupDelayMs, deadlineHours, templates, priceDefault (fallback de produto).
  // - resolveMissionProfileForDeal() → overlay por território: limites, prazos, bandeirada/teto e items (P-02).
  // - effective* / priceAgreedFromProfile aplicam o perfil por cima do workflow (ex.: min(agentLimit workflow, agentLimit perfil)).
  const workflow = await resolveWorkflow(workspaceId);

  const missionProfile = await resolveMissionProfileForDeal(workspaceId, metaRecord);
  const agentCap = effectiveAgentLimit(workflow.config.agentLimit, missionProfile);

  // 3. Selecionar agentes (limite do workflow + perfil)
  const agents = await selectAgents(workspaceId, cidade, uf, agentCap);
  if (agents.length === 0) {
    result.errors.push(`Nenhum field agent disponível para ${cidade}/${uf}`);
    return result;
  }

  // 4. Resolver instância Evolution
  const instance = await resolveEvolutionInstance(workspaceId);
  if (!instance) {
    result.errors.push("Instância Evolution não configurada");
    return result;
  }

  // 5. Criar/enviar dossiê se não existir
  await db.propertyDossier.upsert({
    where: { dealId },
    update: { status: "FIELD_PENDING" },
    create: {
      workspaceId,
      dealId,
      status: "FIELD_PENDING",
    },
  });

  const dossierRow = await db.propertyDossier.findUnique({
    where: { dealId },
    select: { id: true },
  });
  if (dossierRow) {
    await ensureDossierChecklist(workspaceId, dossierRow.id);
  }

  // 6. Para cada agente: criar assignment + enviar Msg 1 (via template)
  for (const agent of agents) {
    if (!agent.partner.phone) {
      result.errors.push(`Agente ${agent.partner.name} sem telefone`);
      continue;
    }

    try {
      // Criar FieldAssignment
      const agreed = priceAgreedFromProfile(agent.pricePerVisit, missionProfile);

      const assignment = await db.fieldAssignment.create({
        data: {
          workspaceId,
          dealId,
          agentId: agent.id,
          profileId: missionProfile?.id ?? null,
          status: "PENDING_CONTACT",
          priceAgreed: agreed,
        },
      });

      // Enviar Mensagem 1 (via template do workflow)
      const msg = buildMessageFromTemplate(
        workflow.templates["initial_contact"] ?? "",
        { nome: agent.partner.name },
      );
      await evolutionApi.sendText(instance, agent.partner.phone, msg, workspaceId);

      // Atualizar status → CONTACTED
      await db.fieldAssignment.update({
        where: { id: assignment.id, workspaceId },
        data: {
          status: "CONTACTED",
          contactedAt: new Date(),
        },
      });

      // [SEC-06] AuditLog
      await writeAudit(workspaceId, "FIELD_AGENT_CONTACTED", {
        dealId,
        agentId: agent.id,
        agentName: agent.partner.name,
        phoneSuffix: agent.partner.phone.slice(-4),
      }, {
        assignmentId: assignment.id,
        status: "CONTACTED",
      });

      // Agendar follow-up (delay configurável via workflow)
      try {
        const { scheduleFollowup } = await import("./field-agent-followup");
        const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
        await scheduleFollowup(
          { assignmentId: assignment.id, workspaceId, dealId },
          { url: redisUrl },
          effectiveFollowupMs(workflow.config.followupDelayMs, missionProfile),
        );
      } catch (err) {
        console.warn("[field-agent-dispatcher] Falha ao agendar follow-up:", err);
      }

      result.assignments.push(assignment.id);
      result.agentsContacted++;
    } catch (err) {
      result.errors.push(
        `Erro ao contactar ${agent.partner.name}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  return result;
}

// ── Mensagens de follow-up (chamadas pela captura de evidências) ──────────

export async function sendAcceptanceDetails(
  assignmentId: string,
  workspaceId: string,
): Promise<void> {
  const assignment = await db.fieldAssignment.findFirst({
    where: { id: assignmentId, workspaceId },
    include: {
      agent: { include: { partner: true } },
      deal: { select: { meta: true } },
      profile: true,
    },
  });

  if (!assignment || !assignment.agent.partner.phone) return;

  const instance = await resolveEvolutionInstance(workspaceId);
  if (!instance) return;

  const meta = (assignment.deal.meta ?? {}) as DealMeta;
  const endereco = meta.imovelEndereco ?? meta.endereco ?? "";
  const cidadePart = meta.imovelCidade ?? meta.cidade ?? "";
  const ufPart = meta.imovelUF ?? meta.uf ?? "";
  const cidade =
    [cidadePart, ufPart].filter((p) => p.trim().length > 0).join("/") || "";
  const preco = Number(assignment.priceAgreed ?? assignment.agent.pricePerVisit);

  const existingMeta = (assignment.meta ?? {}) as Record<string, unknown>;
  const token = assignment.pwaAccessToken;
  const linkVistoria = buildVistoriaUrl(token);

  await db.fieldAssignment.update({
    where: { id: assignmentId, workspaceId },
    data: {
      meta: { ...existingMeta, vistoriaToken: token },
    },
  });

  // Usar template do workflow (fallback para hardcoded)
  const workflow = await resolveWorkflow(workspaceId);
  const prazoH = effectiveDeadlineHours(workflow.config.deadlineHours, assignment.profile);
  const msg = buildMessageFromTemplate(workflow.templates["send_details"] ?? "", {
    nome: assignment.agent.partner.name,
    endereco: endereco || "endereço não informado",
    cidade: cidade || "cidade não informada",
    prazo: String(prazoH),
    valor: preco,
    linkVistoria,
  });

  await evolutionApi.sendText(instance, assignment.agent.partner.phone, msg, workspaceId);

  await db.fieldAssignment.update({
    where: { id: assignmentId, workspaceId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
}

export async function sendConfirmation(
  assignmentId: string,
  workspaceId: string,
): Promise<void> {
  const assignment = await db.fieldAssignment.findFirst({
    where: { id: assignmentId, workspaceId },
    include: { agent: { include: { partner: true } } },
  });

  if (!assignment || !assignment.agent.partner.phone) return;

  const instance = await resolveEvolutionInstance(workspaceId);
  if (!instance) return;

  // Usar template do workflow (fallback para hardcoded)
  const workflow = await resolveWorkflow(workspaceId);
  const msg = buildMessageFromTemplate(
    workflow.templates["send_confirmation"] ?? "",
    {},
  );
  await evolutionApi.sendText(instance, assignment.agent.partner.phone, msg, workspaceId);

  await db.fieldAssignment.update({
    where: { id: assignmentId, workspaceId },
    data: { status: "IN_PROGRESS" },
  });
}

export { buildMsg1, buildMsg2, buildMsg3 };
