/**
 * Portal Queries — dados do deal para o cliente arrematante.
 * Server-side only: jamais importar em Client Components.
 */

import { db } from "@flow-os/db";

// ─── Tipos de domínio do portal ──────────────────────────────────────────────

export type PhaseStatus = "pending" | "active" | "done";

export interface PortalPhase {
  id:          string;
  label:       string;      // "ITBI", "REGISTRO" — técnico (interno)
  humanLabel:  string;      // "Imposto Municipal" — para o cliente
  description: string;      // Explicação em linguagem simples
  icon:        string;      // emoji
  status:      PhaseStatus;
  order:       number;
  parallel:    boolean;     // branches paralelas
}

export interface PortalDocument {
  id:          string;
  label:       string;      // "Foto da sua CNH"
  description: string;      // Instrução simples
  required:    boolean;
  status:      "pending" | "uploaded" | "approved";
  phase:       string;
}

export interface PortalTimelineEvent {
  id:          string;
  date:        Date;
  title:       string;
  description: string;
  type:        "info" | "success" | "warning" | "milestone";
}

export interface PortalDealData {
  deal: {
    id:             string;
    title:          string;
    value:          number | null;
    imovelEndereco: string;
    imovelCidade:   string;
    imovelUF:       string;
    etapaLabel:     string;     // "Pós-Arrematação"
    rocketRoomId:   string | null;
  };
  actor: {
    name:  string;
    phone: string;
    email: string | null;
  };
  responsible: {
    name:  string;
    phone: string;   // número WhatsApp do corretor/consultor
  };
  phases:       PortalPhase[];
  currentPhase: PortalPhase | null;
  nextStep: {
    title:       string;
    description: string;
    urgent:      boolean;
    slaLabel:    string | null;
  } | null;
  documents:    PortalDocument[];
  timeline:     PortalTimelineEvent[];
}

// ─── Mapeamentos humanos ──────────────────────────────────────────────────────

const PHASE_META: Record<
  string,
  { humanLabel: string; description: string; icon: string; order: number; parallel?: boolean }
> = {
  CONTRATO: {
    humanLabel:  "Assinatura do Contrato",
    description: "O contrato de compra e venda está sendo preparado pela Caixa.",
    icon:        "📄",
    order:       1,
  },
  ITBI: {
    humanLabel:  "Imposto de Transmissão (ITBI)",
    description: "Cálculo e pagamento do imposto municipal de transferência do imóvel.",
    icon:        "🏛️",
    order:       2,
  },
  REGISTRO: {
    humanLabel:  "Registro em Cartório",
    description: "Registro da escritura no Cartório de Registro de Imóveis.",
    icon:        "📝",
    order:       3,
  },
  TROCA_TITULARIDADE: {
    humanLabel:  "Transferência do Imóvel",
    description: "Atualização dos dados do imóvel para o seu nome.",
    icon:        "🔑",
    order:       4,
  },
  CONDOMINIO: {
    humanLabel:  "Regularização do Condomínio",
    description: "Regularização das taxas e débitos de condomínio em aberto.",
    icon:        "🏢",
    order:       5,
    parallel:    true,
  },
  DESOCUPACAO: {
    humanLabel:  "Desocupação do Imóvel",
    description: "Processo de desocupação, caso o imóvel esteja ocupado.",
    icon:        "🚪",
    order:       6,
    parallel:    true,
  },
  IPTU: {
    humanLabel:  "Regularização do IPTU",
    description: "Transferência e regularização do IPTU no nome do novo proprietário.",
    icon:        "📋",
    order:       7,
  },
  LEILAO_NEGATIVO: {
    humanLabel:  "Certidão de Leilão",
    description: "Obtenção da certidão negativa de leilões anteriores.",
    icon:        "⚖️",
    order:       8,
  },
};

const ETAPA_LABELS: Record<string, string> = {
  captacao:          "Captação",
  arremataçao:       "Arrematação",
  arrematacao:       "Arrematação",
  onboarding:        "Início do Processo",
  pos_arrematacao:   "Andamento do Processo",
  entrega:           "Entrega das Chaves",
  WON:               "Concluído",
  LOST:              "Encerrado",
};

// ─── Documentos padrão do arrematante ────────────────────────────────────────

const DEFAULT_DOCUMENTS: Omit<PortalDocument, "id" | "status">[] = [
  {
    label:       "Foto da sua CNH ou RG",
    description: "Documento de identidade legível dos dois lados",
    required:    true,
    phase:       "CONTRATO",
  },
  {
    label:       "Comprovante de residência",
    description: "Conta de água, luz ou telefone dos últimos 3 meses",
    required:    true,
    phase:       "CONTRATO",
  },
  {
    label:       "CPF",
    description: "Foto do seu CPF ou comprovante do número",
    required:    true,
    phase:       "CONTRATO",
  },
  {
    label:       "Guia de pagamento do ITBI",
    description: "Guia emitida pela prefeitura — enviaremos quando estiver disponível",
    required:    true,
    phase:       "ITBI",
  },
  {
    label:       "Comprovante de pagamento do ITBI",
    description: "Comprovante bancário após o pagamento da guia",
    required:    true,
    phase:       "ITBI",
  },
  {
    label:       "Proposta de arrematação",
    description: "Documento de proposta enviado no dia do leilão",
    required:    false,
    phase:       "CONTRATO",
  },
];

// ─── Query principal ──────────────────────────────────────────────────────────

export async function getPortalDealData(
  dealId: string,
  actorId: string,
): Promise<PortalDealData | null> {
  // Busca deal com contato e owner
  const deal = await db.deal.findFirst({
    where:  { id: dealId },
    include: {
      contact: true,
      workspace: {
        include: { members: { where: { role: "OWNER" }, take: 1 } },
      },
    },
  });

  if (!deal) return null;

  // Extrai meta do deal (template real_estate_caixa ou genérico)
  const meta = (deal.meta ?? {}) as Record<string, unknown>;

  // Endereço do imóvel
  const imovelEndereco = String(meta["imovelEndereco"] ?? meta["endereco"] ?? deal.title);
  const imovelCidade   = String(meta["imovelCidade"]   ?? meta["cidade"]   ?? "");
  const imovelUF       = String(meta["imovelUF"]       ?? meta["uf"]       ?? "");

  // Etapa atual
  const etapaRaw = String(meta["etapa"] ?? meta["stage"] ?? "onboarding");
  const etapaLabel = ETAPA_LABELS[etapaRaw] ?? "Em andamento";

  // Fases do deal (array de fases ativas/concluídas)
  const fasesRaw = meta["fases"] as Record<string, PhaseStatus> | undefined;

  // Dados do ator (arrematante)
  const contact = deal.contact;
  const actorName  = contact?.name  ?? "Arrematante";
  const actorPhone = contact?.phone ?? "";
  const actorEmail = contact?.email ?? null;

  // Responsável (corretor/consultor) — vem da meta ou do workspace OWNER
  const corretorPhone = String(meta["corretorPhone"] ?? meta["responsiblePhone"] ?? "");
  const corretorName  = String(meta["corretorName"]  ?? meta["responsibleName"]  ?? "Seu consultor");

  // Monta fases com status calculado
  const phases: PortalPhase[] = Object.entries(PHASE_META)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([phaseId, meta]) => {
      const statusFromMeta = fasesRaw?.[phaseId] as PhaseStatus | undefined;

      // Fase ativa é determinada pelo campo da meta ou pela fase atual do deal
      const currentPhaseFromMeta = String(deal.meta?.["currentPhase" as keyof typeof deal.meta] ?? "CONTRATO");
      let status: PhaseStatus;
      if (statusFromMeta) {
        status = statusFromMeta;
      } else {
        // Inferência simples por ordem
        const currentOrder = PHASE_META[currentPhaseFromMeta]?.order ?? 1;
        if (meta.order < currentOrder)       status = "done";
        else if (meta.order === currentOrder) status = "active";
        else                                  status = "pending";
      }

      return {
        id:          phaseId,
        label:       phaseId,
        humanLabel:  meta.humanLabel,
        description: meta.description,
        icon:        meta.icon,
        status,
        order:       meta.order,
        parallel:    meta.parallel ?? false,
      };
    });

  // Fase atual
  const currentPhase = phases.find(p => p.status === "active") ?? null;

  // Próximo passo
  const nextStep = buildNextStep(currentPhase, meta);

  // Documentos — combina padrão com estado do banco (simplificado)
  const documentsRaw = meta["documents"] as Record<string, "pending" | "uploaded" | "approved"> | undefined;
  const documents: PortalDocument[] = DEFAULT_DOCUMENTS.map((doc, i) => ({
    ...doc,
    id:     `doc-${i}`,
    status: documentsRaw?.[doc.label.toLowerCase().replace(/\s+/g, "_")] ?? "pending",
  }));

  // Timeline: eventos de auditoria do deal
  const auditEvents = await db.agentAuditLog.findMany({
    where:   { workspaceId: deal.workspaceId },
    orderBy: { createdAt: "desc" },
    take:    20,
    select:  { id: true, action: true, output: true, createdAt: true, success: true },
  });

  const timeline: PortalTimelineEvent[] = [
    // Marco inicial sempre presente
    {
      id:          "start",
      date:        deal.createdAt,
      title:       "Processo iniciado",
      description: `Sua assessoria para o imóvel foi iniciada em ${deal.createdAt.toLocaleDateString("pt-BR")}.`,
      type:        "milestone",
    },
    // Eventos de auditoria filtrados para ações relevantes ao cliente
    ...auditEvents
      .filter(e => !e.action.includes("token-router") && !e.action.includes("webhook"))
      .slice(0, 10)
      .map(e => ({
        id:          e.id,
        date:        e.createdAt,
        title:       actionToHumanLabel(e.action),
        description: actionToHumanDescription(e.action, e.output as Record<string, unknown> | null),
        type:        (e.success ? "info" : "warning") as "info" | "warning",
      })),
  ];

  // Rocket.Chat room
  const rocketRoomId = String(meta["rocketRoomId"] ?? "").trim() || null;

  return {
    deal: { id: deal.id, title: deal.title, value: deal.value ? Number(deal.value) : null, imovelEndereco, imovelCidade, imovelUF, etapaLabel, rocketRoomId },
    actor:       { name: actorName, phone: actorPhone, email: actorEmail },
    responsible: { name: corretorName, phone: corretorPhone },
    phases,
    currentPhase,
    nextStep,
    documents,
    timeline,
  };
}

// ─── Helpers de linguagem ─────────────────────────────────────────────────────

function buildNextStep(
  phase: PortalPhase | null,
  meta: Record<string, unknown>,
): PortalDealData["nextStep"] {
  if (!phase) return null;

  const urgent = Boolean(meta["urgent"] ?? meta["isUrgent"]);

  const steps: Record<string, { title: string; description: string }> = {
    CONTRATO: {
      title:       "Envie seus documentos",
      description: "Precisamos da sua CNH e comprovante de residência para iniciar a análise contratual.",
    },
    ITBI: {
      title:       "Aguarde a guia do ITBI",
      description: "Nossa equipe está preparando a guia de pagamento do imposto municipal. Você receberá uma notificação assim que estiver disponível.",
    },
    REGISTRO: {
      title:       "Aguarde o registro em cartório",
      description: "Os documentos foram enviados ao cartório. O prazo médio é de 20 a 30 dias úteis.",
    },
    TROCA_TITULARIDADE: {
      title:       "Transferência em andamento",
      description: "O imóvel está sendo transferido para o seu nome nos órgãos competentes.",
    },
    CONDOMINIO: {
      title:       "Regularizando o condomínio",
      description: "Estamos verificando e regularizando débitos de condomínio do imóvel.",
    },
    DESOCUPACAO: {
      title:       "Processo de desocupação",
      description: "Estamos acompanhando o processo de desocupação do imóvel. Entraremos em contato com novidades.",
    },
    IPTU: {
      title:       "Transferindo o IPTU",
      description: "O IPTU está sendo transferido para o seu CPF junto à prefeitura.",
    },
    LEILAO_NEGATIVO: {
      title:       "Aguardando certidão",
      description: "Solicitamos a certidão negativa de leilões. Prazo estimado: 5 dias úteis.",
    },
  };

  const step = steps[phase.id];
  if (!step) return null;

  return {
    ...step,
    urgent,
    slaLabel: urgent ? "⚠️ Prazo se aproximando" : null,
  };
}

function actionToHumanLabel(action: string): string {
  if (action.includes("payment_recovery"))  return "Lembrete de pagamento enviado";
  if (action.includes("eisenhower"))        return "Prioridade atualizada";
  if (action.includes("deal.flag_critical")) return "Item marcado como urgente";
  if (action.includes("webhook"))           return "Nova mensagem recebida";
  return "Atualização do processo";
}

function actionToHumanDescription(
  action: string,
  output: Record<string, unknown> | null,
): string {
  if (action.includes("payment_recovery.scheduled")) {
    return "Lembretes de prazo foram programados para garantir que você não perca o prazo.";
  }
  if (action.includes("eisenhower.reclassify_q1")) {
    return "Seu processo foi marcado como prioritário pela equipe.";
  }
  if (output?.["taskId"]) {
    return "Uma nova tarefa foi criada para dar andamento ao seu processo.";
  }
  return "O processo foi atualizado. Acompanhe as próximas etapas aqui.";
}

// ─── Upload URL presigned para upload direto browser → MinIO ─────────────────

/**
 * Gera URL presigned PUT para upload direto do browser ao MinIO.
 * TTL: 15 minutos (apenas para o upload; o Document usa URL de leitura separada).
 *
 * Uso no portal: o DocumentChecklist envia o arquivo diretamente para o MinIO
 * usando esta URL, sem passar pelo Next.js — evita limite de 4 MB do App Router.
 *
 * Alternativa: usar POST /api/portal/upload-document para upload via servidor.
 */
export async function getDocumentUploadUrl(
  dealId:   string,
  docLabel: string,
  orgId:    string,
): Promise<{ url: string; fields: Record<string, string>; key: string } | null> {
  const endpoint  = process.env["MINIO_ENDPOINT"];
  const accessKey = process.env["MINIO_ACCESS_KEY"];
  const secretKey = process.env["MINIO_SECRET_KEY"];
  const bucket    = process.env["MINIO_BUCKET"] ?? "flowos";

  // MinIO não configurado — upload via rota do servidor como fallback
  if (!endpoint || !accessKey || !secretKey) return null;

  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl }               = await import("@aws-sdk/s3-request-presigner");

    const s3 = new S3Client({
      endpoint,
      region:          process.env["MINIO_REGION"] ?? "us-east-1",
      credentials:     { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle:  true,
    });

    const slug = docLabel
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40);

    const key = `${orgId}/${dealId}/docs/${slug}-upload`;

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 15 * 60 }, // 15 min
    );

    return {
      url,
      fields: { key, bucket },
      key,
    };
  } catch (err) {
    console.error("[getDocumentUploadUrl] MinIO error:", err);
    return null;
  }
}
