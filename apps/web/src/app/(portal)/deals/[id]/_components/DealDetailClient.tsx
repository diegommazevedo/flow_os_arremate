"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ATIVIDADE_TIPOS,
  COND_STATUS_VALUES,
  PIPELINE_STAGES,
  type EtapaId,
} from "@flow-os/templates";
import type {
  DealDetailActivity,
  DealDetailData,
  DealDetailDocument,
  DealDetailHistory,
  DealDetailNote,
  DealDetailProtocol,
} from "../_lib/deal-queries";
import { ProtocolModal } from "@/components/protocol-modal";

type TabId     = "notes" | "activities" | "files" | "history" | "protocols";
type MetaTabId = "oferta" | "imovel" | "processos" | "condominio";

interface MetaTab {
  id:       MetaTabId;
  label:    string;
  sections: string[]; // títulos das seções incluídas
}

type FieldType = "text" | "number" | "date" | "checkbox" | "textarea" | "select";

interface FieldConfig {
  path: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
}

interface SectionConfig {
  title: string;
  fields: FieldConfig[];
}

const MODALIDADE_OPTIONS = [
  "Licitação Aberta",
  "Venda Online",
  "Venda Direta Online",
  "Venda Direta",
] as const;

const FORMA_PAGAMENTO_OPTIONS = [
  "À vista",
  "Financiamento",
  "FGTS",
  "Misto",
] as const;

const EXECUTOR_OPTIONS = ["Caixa", "Cliente", "Escritório"] as const;
const STATUS_OPTIONS = ["Não iniciado", "Em andamento", "Finalizado", "Pendente"] as const;
const PRIORITY_OPTIONS = ["HIGH", "MEDIUM", "LOW"] as const;

// ── Stepper: dependências visuais ─────────────────────────────────────────────
const STAGE_DEPS: Record<string, string[]> = {
  registro:           ["itbi"],
  troca_titularidade: ["registro"],
  emissao_nf:         ["registro"],
};

const PARALLEL_BRANCHES = [
  { key: "condominio",  label: "Condomínio",   statusPath: "condominio.status"   },
  { key: "leiloes",     label: "Averbação",    statusPath: "leiloes.status"      },
  { key: "desocupacao", label: "Desocupação",  statusPath: "desocupacao.status"  },
] as const;

const META_TABS: MetaTab[] = [
  { id: "oferta",     label: "Oferta",      sections: ["Sobre a Oferta"] },
  { id: "imovel",     label: "Imóvel",      sections: ["Sobre o Imóvel"] },
  { id: "processos",  label: "Processos",   sections: ["Averbação dos Leilões", "Troca de Titularidade"] },
  { id: "condominio", label: "Condomínio",  sections: ["Condomínio", "Desocupação"] },
];

const LEFT_SECTIONS: SectionConfig[] = [
  {
    title: "Sobre a Oferta",
    fields: [
      { path: "modalidade", label: "Modalidade", type: "select", options: MODALIDADE_OPTIONS },
      { path: "formaPagamento", label: "Forma de pagamento", type: "select", options: FORMA_PAGAMENTO_OPTIONS },
      { path: "valorArrematacao", label: "Valor da arrematação", type: "number" },
      { path: "valorFinanciado", label: "Valor financiado", type: "number" },
      { path: "valorFgts", label: "Valor FGTS", type: "number" },
      { path: "valorProprios", label: "Valor recursos próprios", type: "number" },
      { path: "dataPropostaVencedora", label: "Data proposta vencedora", type: "date" },
      { path: "dataContratacao", label: "Data contratação", type: "date" },
      { path: "dataVencimentoBoleto", label: "Data vencimento boleto", type: "date" },
      { path: "dataAssinaturaEsperada", label: "Assinatura esperada", type: "date" },
      { path: "dataFechamentoEsperada", label: "Fechamento esperado", type: "date" },
      { path: "corretoraNome", label: "Corretora", type: "text" },
      { path: "creci", label: "CRECI", type: "text" },
      { path: "tipoProduto", label: "Tipo de produto", type: "text" },
    ],
  },
  {
    title: "Sobre o Imóvel",
    fields: [
      { path: "endereco", label: "Endereço", type: "text" },
      { path: "matricula", label: "Matrícula", type: "text" },
      { path: "linkMatricula", label: "Link matrícula", type: "text" },
      { path: "valorAvaliacao", label: "Valor avaliação", type: "number" },
      { path: "atendimentoRevisado", label: "Atendimento revisado", type: "checkbox" },
    ],
  },
  {
    title: "Averbação dos Leilões",
    fields: [
      { path: "leiloes.responsavel", label: "Responsável", type: "text" },
      { path: "leiloes.dataInicio", label: "Data início", type: "date" },
      { path: "leiloes.executor", label: "Executor", type: "select", options: EXECUTOR_OPTIONS },
      { path: "leiloes.statusCaixa", label: "Status Caixa", type: "text" },
      { path: "leiloes.status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { path: "leiloes.protocolo", label: "Protocolo", type: "text" },
      { path: "leiloes.dataVencimentoProtocolo", label: "Vencimento protocolo", type: "date" },
    ],
  },
  {
    title: "Troca de Titularidade",
    fields: [
      { path: "trocaTitularidade.responsavel", label: "Responsável", type: "text" },
      { path: "trocaTitularidade.dataInicio", label: "Data início", type: "date" },
      { path: "trocaTitularidade.executor", label: "Executor", type: "select", options: EXECUTOR_OPTIONS },
      { path: "trocaTitularidade.status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { path: "trocaTitularidade.protocolo", label: "Protocolo", type: "text" },
      { path: "trocaTitularidade.dataTermino", label: "Data término", type: "date" },
    ],
  },
  {
    title: "Condomínio",
    fields: [
      { path: "condominio.possui", label: "Possui condomínio", type: "checkbox" },
      { path: "condominio.status", label: "Status", type: "select", options: COND_STATUS_VALUES },
      { path: "condominio.responsavel", label: "Responsável", type: "text" },
      { path: "condominio.executor", label: "Executor", type: "select", options: EXECUTOR_OPTIONS },
      { path: "condominio.observacoes", label: "Observações", type: "textarea" },
      { path: "condominio.administradora", label: "Administradora", type: "text" },
      { path: "condominio.telefone", label: "Telefone", type: "text" },
      { path: "condominio.email", label: "Email", type: "text" },
    ],
  },
  {
    title: "Desocupação",
    fields: [
      { path: "desocupacao.elegivel", label: "Elegível", type: "checkbox" },
      { path: "desocupacao.clienteQuer", label: "Cliente quer", type: "checkbox" },
      { path: "desocupacao.status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { path: "desocupacao.responsavel", label: "Responsável", type: "text" },
    ],
  },
];

function getValue(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function setValue(source: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const clone = structuredClone(source);
  const parts = path.split(".");
  let cursor: Record<string, unknown> = clone;

  for (const key of parts.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }

  cursor[parts.at(-1)!] = value;
  return clone;
}

function toDateInput(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

async function patchDeal(id: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/deals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Falha ao atualizar deal");
  }

  return response.json();
}

async function createNote(id: string, content: string) {
  const response = await fetch(`/api/deals/${id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error("Falha ao criar anotação");
  }

  return response.json();
}

async function createActivity(id: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/tasks/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, dealId: id }),
  });

  if (!response.ok) {
    throw new Error("Falha ao criar atividade");
  }

  return response.json();
}

async function uploadDocument(id: string, file: File, checklistItemId: string) {
  const formData = new FormData();
  formData.set("dealId", id);
  formData.set("file", file);
  if (checklistItemId) formData.set("checklistItemId", checklistItemId);

  const response = await fetch("/api/portal/upload-document", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Falha ao enviar documento");
  }

  return response.json();
}

async function deleteDocument(dealId: string, documentId: string) {
  const response = await fetch(`/api/deals/${dealId}/documents/${documentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Falha ao excluir documento");
  }

  return response.json();
}

function Section({
  title,
  fields,
  meta,
  onChange,
}: {
  title: string;
  fields: FieldConfig[];
  meta: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => {
          const value = getValue(meta, field.path);

          if (field.type === "checkbox") {
            return (
              <label key={field.path} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200">
                <span>{field.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => onChange(field.path, event.target.checked)}
                  className="h-4 w-4 rounded border-gray-700 bg-gray-950 text-brand-500"
                />
              </label>
            );
          }

          return (
            <label key={field.path} className={field.type === "textarea" ? "md:col-span-2" : ""}>
              <span className="mb-1 block text-xs font-medium text-gray-500">{field.label}</span>
              {field.type === "select" ? (
                <select
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange(field.path, event.target.value || undefined)}
                  className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                >
                  <option value="">Selecionar</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange(field.path, event.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={
                    field.type === "date"
                      ? toDateInput(value)
                      : field.type === "number"
                        ? typeof value === "number" ? String(value) : ""
                        : typeof value === "string" ? value : ""
                  }
                  onChange={(event) => {
                    if (field.type === "number") {
                      onChange(field.path, event.target.value ? Number(event.target.value) : undefined);
                      return;
                    }
                    onChange(field.path, event.target.value || undefined);
                  }}
                  className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                />
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function HistoryItem({ item }: { item: DealDetailHistory }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-white">{item.action}</div>
        <div className="text-xs text-gray-500">{formatDateTime(item.createdAt)}</div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        {item.success ? "Sucesso" : "Falha"}
      </div>
    </div>
  );
}

function ProtocolCard({
  protocol,
  onOpen,
}: {
  protocol: DealDetailProtocol;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{protocol.number}</div>
        <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
          {protocol.canal}
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-400">
        Status: {protocol.status} · {formatDateTime(protocol.updatedAt)}
      </div>
      <div className="mt-1 text-sm text-gray-300">{protocol.assunto ?? "Sem assunto"}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>{protocol.mensagensCount} mensagens</span>
        <button
          type="button"
          onClick={() => onOpen(protocol.id)}
          className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-white"
        >
          Ver →
        </button>
      </div>
    </div>
  );
}

export function DealDetailClient({ initialDeal }: { initialDeal: DealDetailData }) {
  const [activeTab, setActiveTab]   = useState<TabId>("notes");
  const [metaTab,   setMetaTab]     = useState<MetaTabId>("oferta");
  const [title, setTitle] = useState(initialDeal.title);
  const [ownerId, setOwnerId] = useState(initialDeal.ownerId ?? "");
  const [currentPhase, setCurrentPhase] = useState<EtapaId>((String(initialDeal.meta["currentPhase"] ?? "triagem")) as EtapaId);
  const [meta, setMeta] = useState<Record<string, unknown>>(initialDeal.meta);
  const [notes, setNotes] = useState<DealDetailNote[]>(initialDeal.notes);
  const [activities, setActivities] = useState<DealDetailActivity[]>(initialDeal.activities);
  const [documents, setDocuments] = useState<DealDetailDocument[]>(initialDeal.documents);
  const [history] = useState<DealDetailHistory[]>(initialDeal.history);
  const [protocols, setProtocols] = useState<DealDetailProtocol[]>(initialDeal.protocols);
  const [protocolModalId, setProtocolModalId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [documentLabel, setDocumentLabel] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [activityForm, setActivityForm] = useState<{
    title: string;
    type: (typeof ATIVIDADE_TIPOS)[number];
    priority: DealDetailActivity["priority"];
    dueAt: string;
    assigneeId: string;
  }>({
    title: "",
    type: ATIVIDADE_TIPOS[0],
    priority: "MEDIUM",
    dueAt: "",
    assigneeId: ownerId,
  });
  const [isPending, startTransition] = useTransition();

  const stagnatedDays = Number(meta["stagnatedDays"] ?? 0);
  const currentStepOrder = useMemo(
    () => PIPELINE_STAGES.find((stage) => stage.id === currentPhase)?.order ?? 1,
    [currentPhase],
  );

  const refreshProtocols = async () => {
    const response = await fetch(`/api/protocols?dealId=${encodeURIComponent(initialDeal.id)}`);
    if (!response.ok) return;
    const payload = await response.json() as {
      protocols?: Array<DealDetailProtocol & { mensagens?: unknown[]; _count?: { mensagens?: number } }>;
    };

    setProtocols(
      (payload.protocols ?? []).map((protocol) => ({
        id: protocol.id,
        number: protocol.number,
        status: protocol.status,
        canal: protocol.canal,
        assunto: protocol.assunto ?? null,
        createdAt: protocol.createdAt,
        updatedAt: protocol.updatedAt,
        mensagensCount: protocol.mensagensCount ?? protocol._count?.mensagens ?? 0,
      })),
    );
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-gray-800 bg-gray-950 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-2xl font-bold text-white"
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-brand-300">
                {PIPELINE_STAGES.find((stage) => stage.id === currentPhase)?.label}
              </span>
              {stagnatedDays > 7 && (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-300">
                  Estagnado há {stagnatedDays} dias
                </span>
              )}
              <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-gray-400">
                {formatCurrency(initialDeal.value)}
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-500">Proprietário</span>
              <input
                list="assignee-options"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
              />
              <datalist id="assignee-options">
                {initialDeal.assigneeOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>

            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await patchDeal(initialDeal.id, { status: "won" });
              })}
              className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-gray-950"
            >
              Ganho
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await patchDeal(initialDeal.id, { status: "lost" });
              })}
              className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-gray-950"
            >
              Perdido
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await patchDeal(initialDeal.id, { ownerId: ownerId || null });
              })}
              className="sm:col-span-2 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-white"
            >
              Transferir
            </button>
          </div>
        </div>

        {/* ── Stepper principal ─────────────────────────────────────────── */}
        <div className="mt-5 grid gap-2 lg:grid-cols-12">
          {PIPELINE_STAGES.map((stage) => {
            const isActive    = currentPhase === stage.id;
            const isCompleted = stage.order < currentStepOrder;
            const isCurrent   = stage.order <= currentStepOrder;
            const deps        = STAGE_DEPS[stage.id] ?? [];
            const unmetDeps   = deps.filter((depId) => {
              const dep = PIPELINE_STAGES.find((s) => s.id === depId);
              return dep ? dep.order > currentStepOrder : false;
            });
            const hasUnmet = unmetDeps.length > 0;
            return (
              <div key={stage.id} className="group relative">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setCurrentPhase(stage.id as EtapaId);
                    startTransition(async () => {
                      await patchDeal(initialDeal.id, { currentPhase: stage.id });
                    });
                  }}
                  className={[
                    "w-full rounded-2xl border px-3 py-3 text-left text-xs transition-colors",
                    isActive
                      ? "border-brand-500 bg-brand-500/10 text-white"
                      : isCurrent
                        ? "border-gray-700 bg-gray-900 text-gray-300"
                        : "border-gray-800 bg-gray-950 text-gray-600",
                    hasUnmet && !isActive ? "border-amber-900/60" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold">{stage.order}</span>
                    {isCompleted && <span className="text-green-400 text-[10px]">✓</span>}
                    {hasUnmet && !isCompleted && <span className="text-amber-400 text-[10px]">⚠</span>}
                  </div>
                  <div className="mt-1 leading-tight">{stage.label}</div>
                </button>
                {/* Tooltip deps */}
                {hasUnmet && (
                  <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-52 rounded-xl border border-amber-900/60 bg-gray-900 px-2.5 py-2 text-[11px] text-amber-300 shadow-xl group-hover:block">
                    ⚠ Normalmente após:{" "}
                    {unmetDeps
                      .map((id) => PIPELINE_STAGES.find((s) => s.id === id)?.label ?? id)
                      .join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Branches paralelas ────────────────────────────────────────── */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Paralelas</span>
          {PARALLEL_BRANCHES.map((branch) => {
            const status = getValue(meta, branch.statusPath) as string | undefined;
            const isDone    = status === "Finalizado";
            const isStarted = Boolean(status) && status !== "Não iniciado" && status !== "Pendente" && status !== "";
            return (
              <span
                key={branch.key}
                className={[
                  "rounded-full border px-3 py-1 text-[11px] font-medium",
                  isDone
                    ? "border-green-800/60 bg-green-950/40 text-green-300"
                    : isStarted
                      ? "border-amber-800/60 bg-amber-950/30 text-amber-300"
                      : "border-gray-800 bg-gray-950 text-gray-500",
                ].join(" ")}
              >
                {isDone ? "✓ " : isStarted ? "◉ " : "○ "}
                {branch.label}
                {status && status !== "Não iniciado" ? ` · ${status}` : ""}
              </span>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
        <div className="space-y-4">
          {/* ── Abas de bloco ── */}
          <div className="rounded-2xl border border-gray-800 bg-gray-950">
            {/* Tab bar */}
            <div className="flex items-center justify-between gap-2 border-b border-gray-800 px-4 py-3">
              <div className="flex gap-1">
                {META_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMetaTab(tab.id)}
                    className={[
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      metaTab === tab.id
                        ? "bg-brand-500 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(async () => {
                  await patchDeal(initialDeal.id, {
                    title,
                    ownerId: ownerId || null,
                    currentPhase,
                    meta,
                    status: initialDeal.closedAt ? "open" : undefined,
                  });
                })}
                className="rounded-xl bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>

            {/* Sections for active tab */}
            <div className="space-y-4 p-4">
              {LEFT_SECTIONS
                .filter((section) =>
                  META_TABS.find((tab) => tab.id === metaTab)?.sections.includes(section.title)
                )
                .map((section) => (
                  <div key={section.title}>
                    {/* Show section title only when multiple sections in same tab */}
                    {META_TABS.find((tab) => tab.id === metaTab)!.sections.length > 1 && (
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {section.title}
                      </h3>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      {section.fields.map((field) => {
                        const value = getValue(meta, field.path);

                        if (field.type === "checkbox") {
                          return (
                            <label
                              key={field.path}
                              className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200"
                            >
                              <span>{field.label}</span>
                              <input
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(e) =>
                                  setMeta((cur) => setValue(cur, field.path, e.target.checked))
                                }
                                className="h-4 w-4 rounded border-gray-700 bg-gray-950 text-brand-500"
                              />
                            </label>
                          );
                        }

                        return (
                          <label
                            key={field.path}
                            className={field.type === "textarea" ? "md:col-span-2" : ""}
                          >
                            <span className="mb-1 block text-xs font-medium text-gray-500">
                              {field.label}
                            </span>
                            {field.type === "select" ? (
                              <select
                                value={typeof value === "string" ? value : ""}
                                onChange={(e) =>
                                  setMeta((cur) => setValue(cur, field.path, e.target.value || undefined))
                                }
                                className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                              >
                                <option value="">Selecionar</option>
                                {field.options?.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            ) : field.type === "textarea" ? (
                              <textarea
                                value={typeof value === "string" ? value : ""}
                                onChange={(e) =>
                                  setMeta((cur) => setValue(cur, field.path, e.target.value))
                                }
                                rows={4}
                                className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                              />
                            ) : (
                              <input
                                type={
                                  field.type === "number" ? "number"
                                  : field.type === "date"   ? "date"
                                  : "text"
                                }
                                value={
                                  field.type === "date"
                                    ? toDateInput(value)
                                    : field.type === "number"
                                      ? typeof value === "number" ? String(value) : ""
                                      : typeof value === "string" ? value : ""
                                }
                                onChange={(e) => {
                                  if (field.type === "number") {
                                    setMeta((cur) =>
                                      setValue(cur, field.path, e.target.value ? Number(e.target.value) : undefined)
                                    );
                                    return;
                                  }
                                  setMeta((cur) =>
                                    setValue(cur, field.path, e.target.value || undefined)
                                  );
                                }}
                                className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
            <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-3">
              {([
                { id: "notes", label: "Anotações" },
                { id: "activities", label: "Atividades" },
                { id: "files", label: "Arquivos" },
                { id: "history", label: "Histórico" },
                { id: "protocols", label: "Protocolos" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-brand-500 text-gray-950"
                      : "bg-gray-900 text-gray-400 hover:text-white",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "notes" && (
              <div className="space-y-4 pt-4">
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white">{note.authorName}</div>
                        <div className="text-xs text-gray-500">{formatDateTime(note.createdAt)}</div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{note.content}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <textarea
                    value={noteContent}
                    onChange={(event) => setNoteContent(event.target.value)}
                    rows={4}
                    placeholder="Adicionar nova nota..."
                    className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    disabled={isPending || !noteContent.trim()}
                    onClick={() => startTransition(async () => {
                      const result = await createNote(initialDeal.id, noteContent.trim());
                      setNotes((current) => [result.note as DealDetailNote, ...current]);
                      setNoteContent("");
                    })}
                    className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950"
                  >
                    Adicionar nota
                  </button>
                </div>
              </div>
            )}

            {activeTab === "activities" && (
              <div className="space-y-4 pt-4">
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div key={activity.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">{activity.title}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {activity.type ?? "Atividade"} · {activity.priority} · {activity.assigneeId ?? "Sem responsável"}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {activity.dueAt ? formatDateTime(activity.dueAt) : "Sem data"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
                  <input
                    value={activityForm.title}
                    onChange={(event) => setActivityForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="+ Atividade"
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    <select
                      value={activityForm.type}
                      onChange={(event) => setActivityForm((current) => ({
                        ...current,
                        type: event.target.value as (typeof ATIVIDADE_TIPOS)[number],
                      }))}
                      className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                    >
                      {ATIVIDADE_TIPOS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={activityForm.priority}
                      onChange={(event) => setActivityForm((current) => ({
                        ...current,
                        priority: event.target.value as DealDetailActivity["priority"],
                      }))}
                      className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={activityForm.dueAt}
                      onChange={(event) => setActivityForm((current) => ({ ...current, dueAt: event.target.value }))}
                      className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                    />
                    <input
                      list="assignee-options"
                      value={activityForm.assigneeId}
                      onChange={(event) => setActivityForm((current) => ({ ...current, assigneeId: event.target.value }))}
                      placeholder="Responsável"
                      className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isPending || !activityForm.title.trim()}
                    onClick={() => startTransition(async () => {
                      const result = await createActivity(initialDeal.id, {
                        title: activityForm.title,
                        type: activityForm.type,
                        priority: activityForm.priority,
                        assigneeId: activityForm.assigneeId || null,
                        dueAt: activityForm.dueAt ? new Date(activityForm.dueAt).toISOString() : null,
                      });

                      const task = result.task as {
                        id: string;
                        title: string;
                        description: string | null;
                        type: string | null;
                        priority: "HIGH" | "MEDIUM" | "LOW";
                        assigneeId: string | null;
                        dueAt: string | null;
                        completedAt: string | null;
                      };

                      setActivities((current) => [
                        {
                          id: task.id,
                          title: task.title,
                          description: task.description,
                          type: task.type,
                          priority: task.priority,
                          assigneeId: task.assigneeId,
                          dueAt: task.dueAt,
                          completedAt: task.completedAt,
                        },
                        ...current,
                      ]);
                      setActivityForm({
                        title: "",
                        type: ATIVIDADE_TIPOS[0],
                        priority: "MEDIUM",
                        dueAt: "",
                        assigneeId: ownerId,
                      });
                    })}
                    className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950"
                  >
                    Criar atividade
                  </button>
                </div>
              </div>
            )}

            {activeTab === "files" && (
              <div className="space-y-4 pt-4">
                <div className="space-y-3">
                  {documents.map((document) => (
                    <div
                      key={document.id}
                      className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-3 transition-colors hover:border-gray-700"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{document.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{document.contentType}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-gray-500">{formatDateTime(document.createdAt)}</div>
                        <a
                          href={document.url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-xs font-medium text-gray-200 hover:border-gray-600"
                        >
                          Download
                        </a>
                        <button
                          type="button"
                          disabled={isPending || deletingDocumentId === document.id}
                          onClick={() => {
                            setDeletingDocumentId(document.id);
                            startTransition(async () => {
                              try {
                                await deleteDocument(initialDeal.id, document.id);
                                setDocuments((current) => current.filter((item) => item.id !== document.id));
                              } finally {
                                setDeletingDocumentId((current) => (current === document.id ? null : current));
                              }
                            });
                          }}
                          className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-300 hover:border-red-500/60 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
                  <input
                    value={documentLabel}
                    onChange={(event) => setDocumentLabel(event.target.value)}
                    placeholder="Rótulo opcional do arquivo"
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="file"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    disabled={isPending || !documentFile}
                    onClick={() => startTransition(async () => {
                      if (!documentFile) return;
                      const result = await uploadDocument(initialDeal.id, documentFile, documentLabel);
                      setDocuments((current) => [
                        {
                          id: result.documentId as string,
                          name: documentFile.name,
                          url: result.url as string,
                          contentType: documentFile.type,
                          createdAt: new Date().toISOString(),
                        },
                        ...current,
                      ]);
                      setDocumentFile(null);
                      setDocumentLabel("");
                    })}
                    className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950"
                  >
                    Enviar documento
                  </button>
                </div>
              </div>
            )}

            {activeTab === "protocols" && (
              <div className="space-y-4 pt-4">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    const response = await fetch("/api/protocols", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        dealId: initialDeal.id,
                        assunto: `Atendimento aberto em ${new Date().toLocaleDateString("pt-BR")}`,
                      }),
                    });

                    if (!response.ok) throw new Error("Falha ao abrir protocolo");
                    await refreshProtocols();
                  })}
                  className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950"
                >
                  + Abrir protocolo
                </button>

                <div className="space-y-3">
                  {protocols.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900 px-4 py-8 text-center text-sm text-gray-500">
                      Nenhum protocolo aberto para este deal.
                    </div>
                  ) : (
                    protocols.map((protocol) => (
                      <ProtocolCard
                        key={protocol.id}
                        protocol={protocol}
                        onOpen={setProtocolModalId}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div className="space-y-3 pt-4">
                {history.map((item) => (
                  <HistoryItem key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <ProtocolModal
        open={protocolModalId !== null}
        protocolId={protocolModalId}
        dealId={initialDeal.id}
        onClose={() => setProtocolModalId(null)}
        onUpdated={() => {
          void refreshProtocols();
        }}
      />
    </div>
  );
}
