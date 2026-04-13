import {
  ChatStatus,
  InternalChannelType,
  InternalMessageType,
  MessageDirection,
  PrismaClient,
  ProtocolChannel,
  TaskPriority,
} from "@prisma/client";
import {
  CAIXA_PIPELINE_SLA_DAYS,
  DEAL_PARALLEL_TYPES,
  PIPELINE_STAGE_COLORS,
  PIPELINE_STAGES,
  desiredParallelActivation,
  UF_DEPARTMENT_MAP,
} from "@flow-os/templates";
import { ParallelStatus } from "@prisma/client";

const db = new PrismaClient();

const DEMO_DEALS = [
  {
    id: "seed-deal-s3-001",
    chb: "8787706136750",
    name: "Rodrigo Otávio de Oliveira Baptista Magalhães",
    cidade: "Valparaíso de Goias",
    uf: "GO",
    condStatus: "Aguardando cliente",
    condObs: "O Cliente fez um parcelamento das dívidas de condomínio.",
    phase: "registro",
    eisenhower: "Q2_PLAN",
    modalidade: "Venda Direta Online",
    formaPagamento: "Financiamento",
    value: 312000,
  },
  {
    id: "seed-deal-s3-002",
    chb: "8787704078574",
    name: "ALEX CANDIDO DA SILVA",
    cidade: "JUIZ DE FORA",
    uf: "MG",
    condStatus: "Emitir CND de Condomínio",
    condObs: "Solicitar CND BV Garantia dia 06/04 - A caixa pagou 25/03",
    phase: "escritura",
    eisenhower: "Q1_DO",
    modalidade: "Venda Online",
    formaPagamento: "FGTS",
    value: 284000,
  },
  {
    id: "seed-deal-s3-003",
    chb: "8787715049732",
    name: "BRUNO NEUTZLING ALDEIA DOS SANTOS AGUILAR",
    cidade: "SAO JOSE",
    uf: "SC",
    condStatus: "Aguardando cliente",
    condObs: "Cliente não responde quanto a dívidas de condomínio.",
    phase: "itbi",
    eisenhower: "Q1_DO",
    modalidade: "Licitação Aberta",
    formaPagamento: "À vista",
    value: 425000,
  },
  {
    id: "seed-deal-s3-004",
    chb: "8555527216545",
    name: "Mayko Soares",
    cidade: "RIBEIRAO PRETO",
    uf: "SP",
    condStatus: "Encaminhado Para Pagamento",
    condObs: "Caixa programou para 13/03",
    phase: "escritura",
    eisenhower: "Q2_PLAN",
    modalidade: "Venda Direta",
    formaPagamento: "Misto",
    value: 351000,
  },
  {
    id: "seed-deal-s3-005",
    chb: "8787708311915",
    name: "HERMINIO DUQUE LUSTOSA",
    cidade: "SAO JOSE DOS CAMPOS",
    uf: "SP",
    condStatus: "Levantar Débitos e Docs.",
    condObs: "Nova dívida já protocolada na caixa - Vencimento 30/04",
    phase: "registro",
    eisenhower: "Q2_PLAN",
    modalidade: "Venda Direta Online",
    formaPagamento: "Financiamento",
    value: 267000,
  },
] as const;

const DEPARTAMENTOS = [
  "ATD_CENTRO_OESTE",
  "ATD_NORDESTE",
  "ATD_NORTE",
  "ATD_SUDESTE_RJMG",
  "ATD_SUDESTE_SP",
  "ATD_SUL",
  "PRE_AUCTION_EVENT",
  "GESTAO_PRE_AUCTION",
  "POS_AUCTION_EVENT",
  "CRÉDITO ANÁLISE",
  "CRÉDITO PROCESSO FINANCIAMENTO",
  "SUPORTE ATENDIMENTO",
] as const;

const TAGS = [
  { descricao: "CONDOMÍNIO", corFundo: "#f59e0b", corTexto: "#fff" },
  { descricao: "CARTÓRIO", corFundo: "#8b5cf6", corTexto: "#fff" },
  { descricao: "PREFEITURA", corFundo: "#3b82f6", corTexto: "#fff" },
  { descricao: "pagamento-avista", corFundo: "#10b981", corTexto: "#fff" },
  { descricao: "pagamento-financiado", corFundo: "#6366f1", corTexto: "#fff" },
  { descricao: "origem-manual", corFundo: "#6b7280", corTexto: "#fff" },
  { descricao: "origem-anuncio", corFundo: "#ec4899", corTexto: "#fff" },
  { descricao: "origem-redesocial", corFundo: "#f97316", corTexto: "#fff" },
  { descricao: "origem-indicação", corFundo: "#14b8a6", corTexto: "#fff" },
  { descricao: "origem-site", corFundo: "#84cc16", corTexto: "#fff" },
  { descricao: "desocupacao",               corFundo: "#ef4444", corTexto: "#fff" },
  { descricao: "reforma",                   corFundo: "#f97316", corTexto: "#fff" },
  { descricao: "perfil-primeiro_deal_item", corFundo: "#06b6d4", corTexto: "#fff" },
  { descricao: "CCA Danielle", corFundo: "#a855f7", corTexto: "#fff" },
  { descricao: "CCA Alice", corFundo: "#ec4899", corTexto: "#fff" },
  { descricao: "CCA Rafaela", corFundo: "#f43f5e", corTexto: "#fff" },
  { descricao: "CCA Paulo", corFundo: "#3b82f6", corTexto: "#fff" },
  { descricao: "Assessoria A4M", corFundo: "#059669", corTexto: "#fff" },
] as const;

const RESPOSTAS = [
  {
    atalho: "payment_doc",
    texto: "Olá {PRIMEIRO_NOME_LEAD}! Segue o link do boleto para pagamento. Qualquer dúvida estamos à disposição.",
  },
  {
    atalho: "boas",
    texto: "{DAY_GREETING} {PRIMEIRO_NOME_LEAD}! Como posso ajudá-lo hoje?",
  },
  {
    atalho: "docs",
    texto: "Para avançarmos com o processo, precisamos dos seguintes documentos:\n• RG ou CNH\n• CPF\n• Comprovante de residência\n• Comprovante de renda",
  },
  {
    atalho: "prazo",
    texto: "O prazo médio do processo é de 3 a 6 meses, dependendo das instituições envolvidas. Fique tranquilo(a), acompanharemos cada etapa!",
  },
  {
    atalho: "cond",
    texto: "Para resolver o condomínio precisamos: CND do condomínio, espelho do boleto e contato da administradora.",
  },
] as const;

const CANAIS_INTERNOS = [
  { nome: "geral", tipo: "CANAL", membros: [] as string[] },
  { nome: "operacional", tipo: "CANAL", membros: [] as string[] },
  { nome: "alertas-q1", tipo: "CANAL", membros: [] as string[] },
  { nome: "atd-sul", tipo: "CANAL", membros: [] as string[] },
  { nome: "atd-sp", tipo: "CANAL", membros: [] as string[] },
  { nome: "atd-rj-mg", tipo: "CANAL", membros: [] as string[] },
  { nome: "atd-nordeste", tipo: "CANAL", membros: [] as string[] },
  { nome: "atd-norte", tipo: "CANAL", membros: [] as string[] },
  { nome: "atd-co", tipo: "CANAL", membros: [] as string[] },
] as const;

const PHASE_TO_STAGE_LABEL: Record<(typeof DEMO_DEALS)[number]["phase"], string> = {
  registro: "Registro de Imóveis",
  escritura: "Escritura Pública Contratação",
  itbi: "ITBI",
};

function addDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function departamentoPorUf(uf: string): string | null {
  // MAPEAMENTO EXTERNO — adaptador UF → chave genérica de departamento
  return UF_DEPARTMENT_MAP[uf.toUpperCase()] ?? null;
}

async function main() {
  console.log("Seeding FlowOS v4...");

  const workspace = await db.workspace.upsert({
    where: { slug: "demo-imobiliaria" },
    update: {
      name: "Imobiliária Demo Caixa",
      sector: "real_estate_caixa",
      settings: {
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        template: "real_estate_caixa",
      },
    },
    create: {
      slug: "demo-imobiliaria",
      name: "Imobiliária Demo Caixa",
      sector: "real_estate_caixa",
      planTier: "pro",
      settings: {
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        template: "real_estate_caixa",
      },
    },
  });

  console.log(`  Workspace: ${workspace.name}`);

  // Evolution API — instância arrematador_01 (logo após workspace: aplica mesmo se re-seed falhar em agentAuditLog por RLS)
  const evolutionIntegration = await db.workspaceIntegration.upsert({
    where: { id: "evolution-arrematador-01" },
    create: {
      id: "evolution-arrematador-01",
      workspaceId: workspace.id,
      type: "WHATSAPP_EVOLUTION",
      name: "Arrematador 01",
      status: "ACTIVE",
      config: {
        EVOLUTION_INSTANCE_NAME: "arrematador_01",
        EVOLUTION_API_URL: "http://localhost:8080",
        apiUrl: "http://localhost:8080",
      },
    },
    update: {
      status: "ACTIVE",
      name: "Arrematador 01",
      config: {
        EVOLUTION_INSTANCE_NAME: "arrematador_01",
        EVOLUTION_API_URL: "http://localhost:8080",
        apiUrl: "http://localhost:8080",
      },
    },
  });
  console.log(`  Evolution integration: ${evolutionIntegration.id}`);

  for (const stage of PIPELINE_STAGES) {
    const index = stage.order - 1;
    const color = PIPELINE_STAGE_COLORS[index] ?? "#64748b";
    const sla = CAIXA_PIPELINE_SLA_DAYS[index];
    await db.stage.upsert({
      where: { workspaceId_position: { workspaceId: workspace.id, position: index } },
      update: {
        name: stage.label,
        color,
        slaDays: sla ?? null,
        isWon: stage.id === "processo_concluido",
        isLost: false,
      },
      create: {
        workspaceId: workspace.id,
        name: stage.label,
        color,
        position: index,
        slaDays: sla ?? null,
        isWon: stage.id === "processo_concluido",
        isLost: false,
      },
    });
  }

  const stages = await db.stage.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true },
  });
  const stageIdByName = new Map(stages.map((stage) => [stage.name, stage.id]));

  await db.agent.upsert({
    where: { id: "seed-agent-rosalia-001" },
    update: {
      workspaceId: workspace.id,
      name: "Rosalía",
      persona: "Agente operacional do fluxo de negócio.",
      skills: ["deal.update_meta", "task.create", "note.create", "flow.trigger"],
      monthlyBudgetUsd: 50,
    },
    create: {
      id: "seed-agent-rosalia-001",
      workspaceId: workspace.id,
      name: "Rosalía",
      persona: "Agente operacional do fluxo de negócio.",
      skills: ["deal.update_meta", "task.create", "note.create", "flow.trigger"],
      monthlyBudgetUsd: 50,
    },
  });

  for (const [ordem, nome] of DEPARTAMENTOS.entries()) {
    await db.department.upsert({
      where: { workspaceId_nome: { workspaceId: workspace.id, nome } },
      update: {
        membros: [],
      },
      create: {
        workspaceId: workspace.id,
        nome,
        membros: [],
      },
    });
  }

  for (const [ordem, tag] of TAGS.entries()) {
    await db.chatTag.upsert({
      where: { workspaceId_descricao: { workspaceId: workspace.id, descricao: tag.descricao } },
      update: {
        corFundo: tag.corFundo,
        corTexto: tag.corTexto,
        ordem,
      },
      create: {
        workspaceId: workspace.id,
        descricao: tag.descricao,
        corFundo: tag.corFundo,
        corTexto: tag.corTexto,
        ordem,
      },
    });
  }

  for (const resposta of RESPOSTAS) {
    await db.respostaRapida.upsert({
      where: { workspaceId_atalho: { workspaceId: workspace.id, atalho: resposta.atalho } },
      update: {
        texto: resposta.texto,
      },
      create: {
        workspaceId: workspace.id,
        atalho: resposta.atalho,
        texto: resposta.texto,
      },
    });
  }

  for (const canal of CANAIS_INTERNOS) {
    await db.internalChannel.upsert({
      where: { workspaceId_nome: { workspaceId: workspace.id, nome: canal.nome } },
      update: {
        tipo: InternalChannelType[canal.tipo],
        membros: canal.membros,
      },
      create: {
        workspaceId: workspace.id,
        nome: canal.nome,
        tipo: InternalChannelType[canal.tipo],
        membros: canal.membros,
      },
    });
  }

  const tagsByDescricao = new Map(
    (await db.chatTag.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, descricao: true },
    })).map((tag) => [tag.descricao, tag.id]),
  );

  const departmentsByNome = new Map(
    (await db.department.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, nome: true },
    })).map((department) => [department.nome, department.id]),
  );

  const internalChannelsByNome = new Map(
    (await db.internalChannel.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, nome: true },
    })).map((channel) => [channel.nome, channel.id]),
  );

  for (const [index, seedDeal] of DEMO_DEALS.entries()) {
    const contactId = `seed-contact-${index + 1}`;
    const stageName = PHASE_TO_STAGE_LABEL[seedDeal.phase];
    const stageId = stageIdByName.get(stageName);

    if (!stageId) throw new Error(`Stage não encontrado para ${stageName}`);

    const origemTag =
      seedDeal.formaPagamento === "À vista"
        ? tagsByDescricao.get("pagamento-avista") ?? null
        : tagsByDescricao.get("pagamento-financiado") ?? null;

    const contact = await db.contact.upsert({
      where: { id: contactId },
      update: {
        workspaceId: workspace.id,
        name: seedDeal.name,
        email: `demo${index + 1}@flowos.local`,
        phone: `55119999999${index + 1}`,
        type: "PERSON",
        meta: {
          investimentoOuUso: index % 2 === 0 ? "Investimento" : "Uso próprio",
          jaArrematou: index % 3 === 0,
          creditoAprovado: index % 2 === 0 ? "Sim" : "Não",
          recursoDisponivel: `${seedDeal.value}`,
          linkDrive: `https://drive.google.com/demo/${seedDeal.chb}`,
          origem: "manual",
          tags: origemTag ? [origemTag] : [],
        },
      },
      create: {
        id: contactId,
        workspaceId: workspace.id,
        name: seedDeal.name,
        email: `demo${index + 1}@flowos.local`,
        phone: `55119999999${index + 1}`,
        type: "PERSON",
        meta: {
          investimentoOuUso: index % 2 === 0 ? "Investimento" : "Uso próprio",
          jaArrematou: index % 3 === 0,
          creditoAprovado: index % 2 === 0 ? "Sim" : "Não",
          recursoDisponivel: `${seedDeal.value}`,
          linkDrive: `https://drive.google.com/demo/${seedDeal.chb}`,
          origem: "manual",
          tags: origemTag ? [origemTag] : [],
        },
      },
    });

    const deal = await db.deal.upsert({
      where: { id: seedDeal.id },
      update: {
        workspaceId: workspace.id,
        stageId,
        contactId: contact.id,
        title: `${seedDeal.chb} - ${seedDeal.name} - ${seedDeal.cidade}/${seedDeal.uf}`,
        value: seedDeal.value,
        meta: {
          imovelId: seedDeal.chb,
          chb: seedDeal.chb,
          cidade: seedDeal.cidade,
          uf: seedDeal.uf,
          endereco: `${seedDeal.cidade}/${seedDeal.uf}`,
          modalidade: seedDeal.modalidade,
          formaPagamento: seedDeal.formaPagamento,
          currentPhase: seedDeal.phase,
          kanbanStatus: "em_progresso",
          eisenhower: seedDeal.eisenhower,
          stagnatedDays: seedDeal.eisenhower === "Q1_DO" ? 9 : 4,
          linkGrupoWhatsApp: `https://chat.whatsapp.com/demo-${index + 1}`,
          condominio: {
            possui: true,
            status: seedDeal.condStatus,
            observacoes: seedDeal.condObs,
            responsavel: "Neemias",
            executor: "Escritório",
            dataInicio: addDays(-(10 + index)).toISOString(),
            telefone: "1133334444",
            email: `condominio${index + 1}@exemplo.com`,
            administradora: `Administradora ${index + 1}`,
          },
          itbi: {
            status: seedDeal.phase === "itbi" ? "Em andamento" : "Finalizado",
            responsavel: "Bruno",
            dataInicio: addDays(-(20 + index)).toISOString(),
          },
          registro: {
            status: seedDeal.phase === "registro" ? "Em andamento" : "Pendente",
            responsavel: "Neemias",
            protocolo: `REG-2026-${index + 1}`,
            cartorio: `Cartório ${index + 1}`,
            dataInicio: addDays(-(8 + index)).toISOString(),
          },
          paymentDeadline: addDays(index === 1 || index === 2 ? 1 : 5).toISOString(),
          boletoStatus: index === 1 ? "PENDENTE" : "AGUARDANDO",
          valorArrematacao: seedDeal.value,
          valorAvaliacao: seedDeal.value + 45000,
          atendimentoRevisado: index % 2 === 0,
          pipedriveId: 1000 + index,
          pipedriveOrigemId: `csv-demo-${index + 1}`,
          ...(index === 0 ? { averbacao: "A realizar" } : {}),
          ...(index === 1 ? { isOcupado: true } : {}),
        },
      },
      create: {
        id: seedDeal.id,
        workspaceId: workspace.id,
        stageId,
        contactId: contact.id,
        title: `${seedDeal.chb} - ${seedDeal.name} - ${seedDeal.cidade}/${seedDeal.uf}`,
        value: seedDeal.value,
        probability: seedDeal.eisenhower === "Q1_DO" ? 80 : 60,
        ownerId: index % 2 === 0 ? "Neemias" : "Bruno",
        expectedCloseDate: addDays(30 + index),
        meta: {
          imovelId: seedDeal.chb,
          chb: seedDeal.chb,
          cidade: seedDeal.cidade,
          uf: seedDeal.uf,
          endereco: `${seedDeal.cidade}/${seedDeal.uf}`,
          modalidade: seedDeal.modalidade,
          formaPagamento: seedDeal.formaPagamento,
          currentPhase: seedDeal.phase,
          kanbanStatus: "em_progresso",
          eisenhower: seedDeal.eisenhower,
          stagnatedDays: seedDeal.eisenhower === "Q1_DO" ? 9 : 4,
          linkGrupoWhatsApp: `https://chat.whatsapp.com/demo-${index + 1}`,
          ...(index === 0 ? { averbacao: "A realizar" } : {}),
          ...(index === 1 ? { isOcupado: true } : {}),
          condominio: {
            possui: true,
            status: seedDeal.condStatus,
            observacoes: seedDeal.condObs,
            responsavel: "Neemias",
            executor: "Escritório",
            dataInicio: addDays(-(10 + index)).toISOString(),
            telefone: "1133334444",
            email: `condominio${index + 1}@exemplo.com`,
            administradora: `Administradora ${index + 1}`,
          },
          itbi: {
            status: seedDeal.phase === "itbi" ? "Em andamento" : "Finalizado",
            responsavel: "Bruno",
            dataInicio: addDays(-(20 + index)).toISOString(),
          },
          registro: {
            status: seedDeal.phase === "registro" ? "Em andamento" : "Pendente",
            responsavel: "Neemias",
            protocolo: `REG-2026-${index + 1}`,
            cartorio: `Cartório ${index + 1}`,
            dataInicio: addDays(-(8 + index)).toISOString(),
          },
          paymentDeadline: addDays(index === 1 || index === 2 ? 1 : 5).toISOString(),
          boletoStatus: index === 1 ? "PENDENTE" : "AGUARDANDO",
          valorArrematacao: seedDeal.value,
          valorAvaliacao: seedDeal.value + 45000,
          atendimentoRevisado: index % 2 === 0,
          pipedriveId: 1000 + index,
          pipedriveOrigemId: `csv-demo-${index + 1}`,
        },
      },
    });

    const desiredPar = desiredParallelActivation(deal.meta as Record<string, unknown>);
    for (const type of DEAL_PARALLEL_TYPES) {
      const status =
        desiredPar[type] === "PENDING" ? ParallelStatus.PENDING : ParallelStatus.INACTIVE;
      await db.dealParallel.upsert({
        where: { dealId_type: { dealId: deal.id, type } },
        create: {
          workspaceId: workspace.id,
          dealId: deal.id,
          type,
          status,
        },
        update: { status, workspaceId: workspace.id },
      });
    }

    const task = await db.task.upsert({
      where: { id: `seed-task-${index + 1}` },
      update: {
        workspaceId: workspace.id,
        dealId: deal.id,
        title: `${seedDeal.condStatus} - Atualizar andamento`,
        description: seedDeal.condObs,
        type: "Condomínio",
        assigneeId: deal.ownerId ?? "Neemias",
        quadrant: seedDeal.eisenhower,
        priority: seedDeal.eisenhower === "Q1_DO" ? TaskPriority.HIGH : TaskPriority.MEDIUM,
        urgent: seedDeal.eisenhower === "Q1_DO",
        important: true,
        dueAt: addDays(index + 1),
      },
      create: {
        id: `seed-task-${index + 1}`,
        workspaceId: workspace.id,
        dealId: deal.id,
        title: `${seedDeal.condStatus} - Atualizar andamento`,
        description: seedDeal.condObs,
        type: "Condomínio",
        assigneeId: deal.ownerId ?? "Neemias",
        quadrant: seedDeal.eisenhower,
        priority: seedDeal.eisenhower === "Q1_DO" ? TaskPriority.HIGH : TaskPriority.MEDIUM,
        urgent: seedDeal.eisenhower === "Q1_DO",
        important: true,
        dueAt: addDays(index + 1),
      },
    });

    const departmentName = departamentoPorUf(seedDeal.uf);
    const departamentoId = departmentName ? (departmentsByNome.get(departmentName) ?? null) : null;

    await db.chatSession.upsert({
      where: { taskId: task.id },
      update: {
        status: ChatStatus.ABERTO,
        departamentoId,
        responsavelId: task.assigneeId,
        chatbotAtivo: true,
        favorito: index < 2,
        unreadCount: index === 0 ? 2 : 0,
        totalAtendimentos: index + 1,
      },
      create: {
        workspaceId: workspace.id,
        taskId: task.id,
        status: ChatStatus.ABERTO,
        departamentoId,
        responsavelId: task.assigneeId,
        chatbotAtivo: true,
        favorito: index < 2,
        unreadCount: index === 0 ? 2 : 0,
        totalAtendimentos: index + 1,
      },
    });

    const protocolNumber = `CHB-${seedDeal.chb}-${String(index + 1).padStart(3, "0")}`;
    const protocol = await db.protocol.upsert({
      where: { number: protocolNumber },
      update: {
        workspaceId: workspace.id,
        dealId: deal.id,
        taskId: task.id,
        canal: index % 2 === 0 ? ProtocolChannel.WHATSAPP : ProtocolChannel.PWA,
        status: index % 2 === 0 ? ChatStatus.EM_ATENDIMENTO : ChatStatus.RESOLVIDO,
        assunto: `Atendimento inicial ${seedDeal.phase}`,
        resolvidoEm: index % 2 === 0 ? null : addDays(-1),
      },
      create: {
        workspaceId: workspace.id,
        number: protocolNumber,
        dealId: deal.id,
        taskId: task.id,
        canal: index % 2 === 0 ? ProtocolChannel.WHATSAPP : ProtocolChannel.PWA,
        status: index % 2 === 0 ? ChatStatus.EM_ATENDIMENTO : ChatStatus.RESOLVIDO,
        assunto: `Atendimento inicial ${seedDeal.phase}`,
        resolvidoEm: index % 2 === 0 ? null : addDays(-1),
      },
    });

    await db.protocolMessage.upsert({
      where: { id: `seed-protocol-message-in-${index + 1}` },
      update: {
        workspaceId: workspace.id,
        protocolId: protocol.id,
        direction: MessageDirection.IN,
        canal: protocol.canal,
        conteudo: `Cliente pediu atualização sobre ${seedDeal.phase}.`,
        autorId: null,
      },
      create: {
        id: `seed-protocol-message-in-${index + 1}`,
        workspaceId: workspace.id,
        protocolId: protocol.id,
        direction: MessageDirection.IN,
        canal: protocol.canal,
        conteudo: `Cliente pediu atualização sobre ${seedDeal.phase}.`,
        autorId: null,
      },
    });

    await db.protocolMessage.upsert({
      where: { id: `seed-protocol-message-out-${index + 1}` },
      update: {
        workspaceId: workspace.id,
        protocolId: protocol.id,
        direction: MessageDirection.OUT,
        canal: protocol.canal,
        conteudo: `Equipe retornou com andamento do protocolo ${protocolNumber}.`,
        autorId: deal.ownerId ?? "seed-admin",
      },
      create: {
        id: `seed-protocol-message-out-${index + 1}`,
        workspaceId: workspace.id,
        protocolId: protocol.id,
        direction: MessageDirection.OUT,
        canal: protocol.canal,
        conteudo: `Equipe retornou com andamento do protocolo ${protocolNumber}.`,
        autorId: deal.ownerId ?? "seed-admin",
      },
    });

    const operationalChannelId = internalChannelsByNome.get("operacional");
    if (operationalChannelId) {
      await db.internalMessage.upsert({
        where: { id: `seed-internal-message-${index + 1}` },
        update: {
          workspaceId: workspace.id,
          channelId: operationalChannelId,
          autorId: deal.ownerId ?? "seed-admin",
          conteudo: `Thread operacional vinculada ao protocolo ${protocolNumber}.`,
          tipo: InternalMessageType.PROTOCOL_REF,
          dealId: deal.id,
          protocolId: protocol.id,
        },
        create: {
          id: `seed-internal-message-${index + 1}`,
          workspaceId: workspace.id,
          channelId: operationalChannelId,
          autorId: deal.ownerId ?? "seed-admin",
          conteudo: `Thread operacional vinculada ao protocolo ${protocolNumber}.`,
          tipo: InternalMessageType.PROTOCOL_REF,
          dealId: deal.id,
          protocolId: protocol.id,
        },
      });
    }

    if (seedDeal.eisenhower === "Q1_DO") {
      const alertChannelId = internalChannelsByNome.get("alertas-q1");
      if (alertChannelId) {
        await db.internalMessage.upsert({
          where: { id: `seed-q1-alert-${index + 1}` },
          update: {
            workspaceId: workspace.id,
            channelId: alertChannelId,
            autorId: "SISTEMA",
            conteudo: `ALERTA Q1 - Deal em atenção imediata (${protocolNumber})`,
            tipo: InternalMessageType.ALERTA_Q1,
            dealId: deal.id,
            protocolId: protocol.id,
          },
          create: {
            id: `seed-q1-alert-${index + 1}`,
            workspaceId: workspace.id,
            channelId: alertChannelId,
            autorId: "SISTEMA",
            conteudo: `ALERTA Q1 - Deal em atenção imediata (${protocolNumber})`,
            tipo: InternalMessageType.ALERTA_Q1,
            dealId: deal.id,
            protocolId: protocol.id,
          },
        });
      }
    }

    await db.dealNote.upsert({
      where: { id: `seed-note-${index + 1}` },
      update: {
        workspaceId: workspace.id,
        dealId: deal.id,
        authorId: "seed-admin",
        authorName: "Bruno",
        content: seedDeal.condObs,
        pinned: index === 0,
      },
      create: {
        id: `seed-note-${index + 1}`,
        workspaceId: workspace.id,
        dealId: deal.id,
        authorId: "seed-admin",
        authorName: "Bruno",
        content: seedDeal.condObs,
        pinned: index === 0,
      },
    });

    await db.document.upsert({
      where: { id: `seed-doc-${index + 1}` },
      update: {
        workspaceId: workspace.id,
        dealId: deal.id,
        name: `property_ref-${seedDeal.chb}.pdf`,
        url: `https://example.com/docs/${seedDeal.chb}.pdf`,
        collection: "deal_docs",
        meta: { source: "seed" },
      },
      create: {
        id: `seed-doc-${index + 1}`,
        workspaceId: workspace.id,
        dealId: deal.id,
        name: `property_ref-${seedDeal.chb}.pdf`,
        url: `https://example.com/docs/${seedDeal.chb}.pdf`,
        collection: "deal_docs",
        meta: { source: "seed" },
      },
    });

    await db.agentAuditLog.upsert({
      where: { id: `seed-audit-${index + 1}` },
      update: {
        workspaceId: workspace.id,
        agentId: "seed-agent-rosalia-001",
        action: "deal.seeded",
        input: { dealId: deal.id, phase: seedDeal.phase },
        output: { seeded: true },
        modelUsed: "none",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
        success: true,
      },
      create: {
        id: `seed-audit-${index + 1}`,
        workspaceId: workspace.id,
        agentId: "seed-agent-rosalia-001",
        action: "deal.seeded",
        input: { dealId: deal.id, phase: seedDeal.phase },
        output: { seeded: true },
        modelUsed: "none",
        tokensUsed: 0,
        costUsd: 0,
        durationMs: 0,
        success: true,
      },
    });
  }

  // ── PARTE 8: Seed de 20 motoboys fictícios ──────────────────────────────

  const MOCK_FIELD_AGENTS = [
    { nome: "Carlos Moto SP",      telefone: "11999990001", cidade: "São Paulo",        uf: "SP", valor: 80 },
    { nome: "Ana Rider RJ",        telefone: "21988880002", cidade: "Rio de Janeiro",    uf: "RJ", valor: 90 },
    { nome: "João Vistoria MG",    telefone: "31977770003", cidade: "Belo Horizonte",    uf: "MG", valor: 75 },
    { nome: "Maria Campo ES",      telefone: "27966660004", cidade: "Vitória",           uf: "ES", valor: 85 },
    { nome: "Pedro Express PR",    telefone: "41955550005", cidade: "Curitiba",          uf: "PR", valor: 70 },
    { nome: "Julia Sul SC",        telefone: "48944440006", cidade: "Florianópolis",     uf: "SC", valor: 80 },
    { nome: "Rafael Gaucho RS",    telefone: "51933330007", cidade: "Porto Alegre",      uf: "RS", valor: 75 },
    { nome: "Fernanda Centro GO",  telefone: "62922220008", cidade: "Goiânia",           uf: "GO", valor: 65 },
    { nome: "Lucas Capital DF",    telefone: "61911110009", cidade: "Brasília",          uf: "DF", valor: 95 },
    { nome: "Bruna Norte PA",      telefone: "91900000010", cidade: "Belém",             uf: "PA", valor: 100 },
    { nome: "Diego Interior SP",   telefone: "19988880011", cidade: "Campinas",          uf: "SP", valor: 85 },
    { nome: "Camila Litoral RJ",   telefone: "22977770012", cidade: "Niterói",           uf: "RJ", valor: 95 },
    { nome: "Roberto Zona Sul SP", telefone: "11966660013", cidade: "São Paulo",         uf: "SP", valor: 90 },
    { nome: "Patricia Minas MG",   telefone: "35955550014", cidade: "Poços de Caldas",   uf: "MG", valor: 70 },
    { nome: "Marcos Paranaense PR",telefone: "43944440015", cidade: "Londrina",          uf: "PR", valor: 65 },
    { nome: "Vanessa Sul RS",      telefone: "54933330016", cidade: "Caxias do Sul",     uf: "RS", valor: 80 },
    { nome: "Thiago Cerrado GO",   telefone: "64922220017", cidade: "Rio Verde",         uf: "GO", valor: 60 },
    { nome: "Amanda Santos SP",    telefone: "13911110018", cidade: "Santos",            uf: "SP", valor: 85 },
    { nome: "Felipe JF MG",       telefone: "32900000019", cidade: "Juiz de Fora",      uf: "MG", valor: 75 },
    { nome: "Larissa Campestre SC",telefone: "47988880020", cidade: "Joinville",         uf: "SC", valor: 70 },
  ] as const;

  let fieldAgentCount = 0;
  for (const agent of MOCK_FIELD_AGENTS) {
    const partnerId = `seed-partner-fa-${agent.telefone}`;
    await db.partner.upsert({
      where: { workspaceId_phone: { workspaceId: workspace.id, phone: agent.telefone } },
      update: {
        name: agent.nome,
        type: "FIELD_AGENT",
        isActive: true,
      },
      create: {
        id: partnerId,
        workspaceId: workspace.id,
        name: agent.nome,
        phone: agent.telefone,
        type: "FIELD_AGENT",
        isActive: true,
      },
    });

    const partnerRecord = await db.partner.findUnique({
      where: { workspaceId_phone: { workspaceId: workspace.id, phone: agent.telefone } },
      select: { id: true },
    });
    if (!partnerRecord) continue;

    await db.fieldAgentProfile.upsert({
      where: { partnerId: partnerRecord.id },
      update: {
        cities: [agent.cidade],
        states: [agent.uf],
        pricePerVisit: agent.valor,
        availability: "AVAILABLE",
      },
      create: {
        workspaceId: workspace.id,
        partnerId: partnerRecord.id,
        cities: [agent.cidade],
        states: [agent.uf],
        pricePerVisit: agent.valor,
        currency: "BRL",
        availability: "AVAILABLE",
      },
    });
    fieldAgentCount++;
  }

  console.log(`  ${fieldAgentCount} field agents (motoboys) configurados`);

  console.log(`  ${PIPELINE_STAGES.length} etapas de pipeline configuradas`);
  console.log(`  ${DEPARTAMENTOS.length} departamentos configurados`);
  console.log(`  ${TAGS.length} tags configuradas`);
  console.log(`  ${RESPOSTAS.length} respostas rápidas configuradas`);
  console.log(`  ${CANAIS_INTERNOS.length} canais internos configurados`);
  console.log(`  ${DEMO_DEALS.length} deals demo atualizados`);
  console.log("Seed concluído.");
}

main()
  .catch((error) => {
    console.error("Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
