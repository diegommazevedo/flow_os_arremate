/**
 * Field Agent Defaults — Templates e configs hardcoded (fallback)
 *
 * Estes valores são usados quando não há FieldWorkflow configurado no banco.
 * Equivalem ao comportamento original de buildMsg1/buildMsg2/buildMsg3
 * no field-agent-dispatcher.ts.
 */

import { defaultSanitizer } from "@flow-os/core";

// ── Templates padrão ──────────────────────────────────────────────────────

export const DEFAULT_MSG1_TEMPLATE = [
  "Olá {{nome}}! Tudo bem?",
  "",
  "Sou da equipe do Arrematador Caixa. Temos um serviço rápido de vistoria disponível perto de você.",
  "",
  "Interessado em saber mais?",
].join("\n");

/** Chaves substituíveis em Msg2 (send_details) — manter alinhado ao dispatcher e ao MessageEditor. */
export const MSG2_TEMPLATE_VAR_KEYS = [
  "nome",
  "endereco",
  "cidade",
  "prazo",
  "valor",
  "linkVistoria",
] as const;

export type Msg2TemplateVarKey = (typeof MSG2_TEMPLATE_VAR_KEYS)[number];

export const DEFAULT_MSG2_TEMPLATE = [
  "Ótimo! Segue o endereço do imóvel:",
  "",
  "📍 {{endereco}} — {{cidade}}",
  "",
  "⏰ Prazo: {{prazo}}h",
  "💰 Valor combinado: R$ {{valor}}",
  "",
  "📋 Acesse o formulário de vistoria pelo link:",
  "{{linkVistoria}}",
  "",
  "Siga o passo a passo para registrar as evidências.",
  "",
  "Precisamos de:",
  "📸 3 fotos externas da fachada",
  "📸 2 fotos da rua/vizinhança",
  "🎥 1 vídeo curto (30s) da área",
  "🎙 Áudio descrevendo: estado aparente, acesso, segurança percebida",
  "",
  "Pode fazer?",
].join("\n");

export const DEFAULT_MSG3_TEMPLATE = [
  "Perfeito! Quando terminar, manda tudo aqui nessa conversa mesmo.",
  "",
  "Qualquer dúvida, pode perguntar 👍",
].join("\n");

// ── Config padrão ─────────────────────────────────────────────────────────

export const DEFAULT_WORKFLOW_CONFIG = {
  agentLimit: 3,
  followupDelayMs: 2 * 60 * 60 * 1000, // 2h
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
} as const;

// ── Substituição de variáveis ─────────────────────────────────────────────

/**
 * Substitui {{variavel}} no template pelo valor correspondente.
 * Todos os valores são sanitizados antes da inserção.
 */
export function buildMessageFromTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const raw = vars[key];
    if (raw === undefined) return `{{${key}}}`;
    const str = typeof raw === "number" ? raw.toFixed(2) : String(raw);
    return defaultSanitizer.clean(str);
  });
}
