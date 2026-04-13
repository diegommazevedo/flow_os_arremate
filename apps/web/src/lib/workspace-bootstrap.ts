/**
 * Dados mínimos para criar um workspace operacional (admin).
 * Alinhado ao seed principal (`packages/db/prisma/seed.ts`).
 */

export const BOOTSTRAP_STAGES = [
  { id: "triagem", label: "Triagem", color: "#64748b" },
  { id: "sem_acesso_grupo", label: "Sem Acesso ao Grupo", color: "#475569" },
  { id: "primeiro_contato", label: "1º Contato c/ Cliente", color: "#0f766e" },
  { id: "fgts_contratacao", label: "FGTS Contratação", color: "#0ea5e9" },
  { id: "itbi", label: "phase_tax", color: "#f59e0b" },
  { id: "escritura", label: "deed_event", color: "#8b5cf6" },
  { id: "registro", label: "deal_item_registry", color: "#2563eb" },
  { id: "troca_titularidade", label: "Troca de Titularidade", color: "#ec4899" },
  { id: "envio_docs_cef", label: "Envio Docs para CEF", color: "#06b6d4" },
  { id: "docs_aguardando_cef", label: "Docs Enviados / Aguardando CEF", color: "#14b8a6" },
  { id: "emissao_nf", label: "Emissão NF", color: "#f97316" },
  { id: "processo_concluido", label: "Processo Concluído", color: "#22c55e", isWon: true },
] as const;

/** 5 filas regionais padrão (template imobiliário / Caixa). */
export const BOOTSTRAP_DEPARTMENTS_CAIXA = [
  "ATD_SUDESTE_SP",
  "ATD_SUL",
  "ATD_CENTRO_OESTE",
  "ATD_NORDESTE",
  "ATD_NORTE",
] as const;

export const BOOTSTRAP_DEPARTMENTS_GENERIC = ["Comercial", "Operações", "Suporte"] as const;
