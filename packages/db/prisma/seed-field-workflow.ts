/**
 * Seed — Workflow Padrão de Field Agent (motoboy)
 *
 * Popula as tabelas field_workflows, field_workflow_steps, field_workflow_edges,
 * field_message_templates e field_workflow_configs com os valores que hoje estão
 * hardcoded em packages/brain/src/workers/field-agent-dispatcher.ts
 *
 * Uso: npx tsx --tsconfig tsconfig.json prisma/seed-field-workflow.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Buscar primeiro workspace existente
  const workspace = await db.workspace.findFirst({ select: { id: true } });
  if (!workspace) {
    console.log("Nenhum workspace encontrado. Crie um workspace primeiro.");
    return;
  }

  const workspaceId = workspace.id;

  // Checar se já existe workflow padrão
  const existing = await db.fieldWorkflow.findFirst({
    where: { workspaceId, isDefault: true },
  });
  if (existing) {
    console.log(`Workflow padrão já existe (${existing.id}). Pulando seed.`);
    return;
  }

  console.log(`Criando workflow padrão para workspace ${workspaceId}...`);

  // 1. Criar workflow
  const workflow = await db.fieldWorkflow.create({
    data: {
      workspaceId,
      name: "Workflow Padrão",
      description: "Fluxo padrão de dispatch de motoboys — contato inicial, detalhes da vistoria, confirmação.",
      isActive: true,
      isDefault: true,
      version: 1,
    },
  });

  // 2. Criar steps (posição no canvas organizada verticalmente)
  const stepsData = [
    { key: "initial_contact",   label: "Primeiro contato",      type: "SEND_MESSAGE" as const,      position: 0, positionX: 300, positionY: 50 },
    { key: "wait_acceptance",   label: "Aguardar aceite",       type: "WAIT_RESPONSE" as const,     position: 1, positionX: 300, positionY: 180 },
    { key: "send_details",      label: "Enviar detalhes",       type: "SEND_MESSAGE" as const,      position: 2, positionX: 300, positionY: 310 },
    { key: "wait_confirmation", label: "Aguardar confirmação",  type: "WAIT_RESPONSE" as const,     position: 3, positionX: 300, positionY: 440 },
    { key: "send_confirmation", label: "Confirmar serviço",     type: "SEND_MESSAGE" as const,      position: 4, positionX: 300, positionY: 570 },
    { key: "in_progress",       label: "Em andamento",          type: "UPDATE_STATUS" as const,     position: 5, positionX: 300, positionY: 700 },
    { key: "followup_check",    label: "Follow-up (2h)",        type: "SCHEDULE_FOLLOWUP" as const, position: 6, positionX: 550, positionY: 180 },
  ];

  const steps: Record<string, string> = {};
  for (const s of stepsData) {
    const step = await db.fieldWorkflowStep.create({
      data: { workflowId: workflow.id, ...s },
    });
    steps[s.key] = step.id;
  }

  // 3. Criar edges
  const edgesData = [
    { sourceKey: "initial_contact",   targetKey: "wait_acceptance",   label: null },
    { sourceKey: "wait_acceptance",    targetKey: "send_details",      label: "Aceito" },
    { sourceKey: "wait_acceptance",    targetKey: "followup_check",    label: "Sem resposta" },
    { sourceKey: "send_details",       targetKey: "wait_confirmation", label: null },
    { sourceKey: "wait_confirmation",  targetKey: "send_confirmation", label: "Confirmado" },
    { sourceKey: "send_confirmation",  targetKey: "in_progress",       label: null },
    { sourceKey: "followup_check",     targetKey: "initial_contact",   label: "Retry próximo" },
  ];

  for (const e of edgesData) {
    await db.fieldWorkflowEdge.create({
      data: {
        workflowId: workflow.id,
        sourceId: steps[e.sourceKey]!,
        targetId: steps[e.targetKey]!,
        label: e.label,
      },
    });
  }

  // 4. Criar message templates (texto exato do dispatcher atual com placeholders)
  const templatesData = [
    {
      stepKey: "initial_contact",
      name: "msg1_greeting",
      body: [
        "Olá {{nome}}! Tudo bem?",
        "",
        "Sou da equipe do Arrematador Caixa. Temos um serviço rápido de vistoria disponível perto de você.",
        "",
        "Interessado em saber mais?",
      ].join("\n"),
      variables: ["nome"],
    },
    {
      stepKey: "send_details",
      name: "msg2_details",
      body: [
        "Ótimo! Segue o endereço do imóvel:",
        "",
        "📍 {{endereco}}",
        "",
        "Precisamos de:",
        "📸 3 fotos externas da fachada",
        "📸 2 fotos da rua/vizinhança",
        "🎥 1 vídeo curto (30s) da área",
        "🎙 Áudio descrevendo: estado aparente, acesso, segurança percebida",
        "",
        "Valor: R$ {{valor}}",
        "Prazo: até {{prazo}}h",
        "",
        "Pode fazer?",
      ].join("\n"),
      variables: ["endereco", "valor", "prazo"],
    },
    {
      stepKey: "send_confirmation",
      name: "msg3_confirmation",
      body: [
        "Perfeito! Quando terminar, manda tudo aqui nessa conversa mesmo.",
        "",
        "Qualquer dúvida, pode perguntar 👍",
      ].join("\n"),
      variables: [],
    },
  ];

  for (const t of templatesData) {
    await db.fieldMessageTemplate.create({
      data: {
        stepId: steps[t.stepKey]!,
        name: t.name,
        body: t.body,
        variables: t.variables,
      },
    });
  }

  // 5. Criar config com valores atuais hardcoded
  await db.fieldWorkflowConfig.create({
    data: {
      workflowId: workflow.id,
      agentLimit: 3,
      followupDelayMs: 7_200_000, // 2h
      deadlineHours: 48,
      priceDefault: 80,
      currency: "BRL",
      evidenceTypes: [
        "PHOTO_EXTERIOR",
        "PHOTO_SURROUNDINGS",
        "PHOTO_ACCESS",
        "VIDEO_EXTERIOR",
        "VIDEO_SURROUNDINGS",
        "AUDIO_DESCRIPTION",
      ],
      evidenceMinimum: 6,
      autoRetry: true,
    },
  });

  console.log(`Workflow padrão criado com sucesso (${workflow.id})`);
  console.log(`  - ${stepsData.length} steps`);
  console.log(`  - ${edgesData.length} edges`);
  console.log(`  - ${templatesData.length} message templates`);
  console.log(`  - 1 config`);
}

main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
