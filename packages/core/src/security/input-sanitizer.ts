// FlowOS v4 — InputSanitizer [SEC-08]
// Previne prompt injection, PII leaking e inputs maliciosos em calls de IA.

/** Resultado de uma sanitização com rastreabilidade de mudanças */
export interface SanitizeResult {
  sanitized: string;
  originalLength: number;
  finalLength: number;
  blocked: BlockedPattern[];
  warnings: string[];
}

export interface BlockedPattern {
  pattern: string;
  replacement: string;
  occurrences: number;
}

/** Configuração do sanitizador */
export interface SanitizerConfig {
  maxLength?: number;           // default: 8000
  allowMarkdown?: boolean;      // default: true
  blockSystemTokens?: boolean;  // default: true (SEC-08)
  blockPIIPatterns?: boolean;   // default: true (SEC-11)
  stripControlChars?: boolean;  // default: true
}

const DEFAULT_CONFIG: Required<SanitizerConfig> = {
  maxLength: 8000,
  allowMarkdown: true,
  blockSystemTokens: true,
  blockPIIPatterns: true,
  stripControlChars: true,
};

// ─── Padrões de injeção de sistema ────────────────────────────────────────────
// Tokens que modelos LLM interpretam como delimitadores de sistema/instrução.

// Labels são identificadores limpos (sem colchetes) para que o replacement
// [LABEL_BLOCKED] não reintroduza os tokens originais no texto sanitizado.
const SYSTEM_INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\[SYSTEM\]/gi,        label: "SYSTEM" },
  { pattern: /\[\/SYSTEM\]/gi,      label: "END_SYSTEM" },
  { pattern: /\[INST\]/gi,          label: "INST" },
  { pattern: /\[\/INST\]/gi,        label: "END_INST" },
  { pattern: /<<SYS>>/gi,           label: "SYS_TAG" },
  { pattern: /<\/SYS>/gi,           label: "END_SYS_TAG" },
  { pattern: /\bignore\s+all\s+previous\s+instructions?\b/gi, label: "IGNORE_INSTRUCTIONS" },
  { pattern: /\bforget\s+everything\s+above\b/gi,             label: "FORGET_ABOVE" },
  { pattern: /\byou\s+are\s+now\s+(?:a\s+)?(?:dan|jailbroken|unrestricted)\b/gi, label: "JAILBREAK_PERSONA" },
  { pattern: /###\s*(?:system|human|assistant)\s*:/gi,        label: "ROLE_INJECTION" },
  { pattern: /<\|im_start\|>/gi,    label: "IM_START" },
  { pattern: /<\|im_end\|>/gi,      label: "IM_END" },
  { pattern: /<\|endoftext\|>/gi,   label: "ENDOFTEXT" },
];

// ─── Padrões PII — nunca entram no prompt [SEC-11] ────────────────────────────
// CPF, CNPJ, cartão de crédito, email genérico mascarado no log, mas
// no prompt de IA também bloqueamos para evitar vazamento entre tenants.

const PII_PATTERNS: Array<{ pattern: RegExp; label: string; replacement: string }> = [
  {
    pattern: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g,
    label: "CPF",
    replacement: "[CPF_REDACTED]",
  },
  {
    pattern: /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g,
    label: "CNPJ",
    replacement: "[CNPJ_REDACTED]",
  },
  {
    pattern: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6011)[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    label: "CartaoCredito",
    replacement: "[CARD_REDACTED]",
  },
  {
    pattern: /\b[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,}\b/g,
    label: "Email",
    replacement: "[EMAIL_REDACTED]",
  },
];

// ─── Sanitizador principal ────────────────────────────────────────────────────

export class InputSanitizer {
  private config: Required<SanitizerConfig>;

  constructor(config: SanitizerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Sanitiza um input de usuário antes de ser inserido em qualquer prompt de IA.
   * [SEC-08] Prompt injection · [SEC-11] PII fora do contexto IA
   */
  sanitize(input: string): SanitizeResult {
    const warnings: string[] = [];
    const blocked: BlockedPattern[] = [];
    let text = input;
    const originalLength = text.length;

    // 1. Strip caracteres de controle (NULL bytes, etc.)
    if (this.config.stripControlChars) {
      // Preserva \n, \t, \r — remove outros controles ASCII
      const before = text.length;
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      if (text.length < before) {
        warnings.push(`Removidos ${before - text.length} caracteres de controle`);
      }
    }

    // 2. Bloquear tokens de injeção de sistema
    if (this.config.blockSystemTokens) {
      for (const { pattern, label } of SYSTEM_INJECTION_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
          const count = matches.length;
          text = text.replace(pattern, `[${label}_BLOCKED]`);
          blocked.push({ pattern: label, replacement: `[${label}_BLOCKED]`, occurrences: count });
        }
      }
    }

    // 3. Redact PII
    if (this.config.blockPIIPatterns) {
      for (const { pattern, label, replacement } of PII_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
          const count = matches.length;
          text = text.replace(pattern, replacement);
          blocked.push({ pattern: label, replacement, occurrences: count });
          warnings.push(`${count} ocorrência(s) de ${label} redatadas [SEC-11]`);
        }
      }
    }

    // 4. Truncar ao limite máximo
    if (text.length > this.config.maxLength) {
      warnings.push(`Input truncado de ${text.length} → ${this.config.maxLength} chars`);
      text = text.slice(0, this.config.maxLength);
    }

    // 5. Trim final
    text = text.trim();

    return {
      sanitized: text,
      originalLength,
      finalLength: text.length,
      blocked,
      warnings,
    };
  }

  /**
   * Versão simplificada — retorna apenas a string sanitizada.
   * Usar quando não é necessário inspecionar o que foi bloqueado.
   */
  clean(input: string): string {
    return this.sanitize(input).sanitized;
  }

  /**
   * Verifica se um input contém tentativas de injeção.
   * Útil para logging de segurança sem modificar o input.
   */
  detect(input: string): { hasInjection: boolean; hasPII: boolean; details: string[] } {
    const details: string[] = [];
    let hasInjection = false;
    let hasPII = false;

    for (const { pattern, label } of SYSTEM_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        hasInjection = true;
        details.push(`Injection attempt: ${label}`);
        pattern.lastIndex = 0;
      }
    }

    for (const { pattern, label } of PII_PATTERNS) {
      if (pattern.test(input)) {
        hasPII = true;
        details.push(`PII detected: ${label}`);
        pattern.lastIndex = 0;
      }
    }

    return { hasInjection, hasPII, details };
  }
}

/** Instância padrão com configuração do núcleo */
export const defaultSanitizer = new InputSanitizer();

/** Helper para uso direto sem instanciar */
export function sanitizePrompt(input: string, config?: SanitizerConfig): string {
  return new InputSanitizer(config).clean(input);
}
