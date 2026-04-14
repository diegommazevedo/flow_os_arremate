"use client";

import { useRef } from "react";

const SAMPLE_VARS: Record<string, string> = {
  nome: "João Silva",
  endereco: "Rua das Flores, 123 — São Paulo/SP",
  valor: "80.00",
  prazo: "48",
};

interface Props {
  body: string;
  variables: string[];
  onChange: (body: string) => void;
}

export function MessageEditor({ body, variables, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insertVar = (v: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newText = body.slice(0, start) + `{{${v}}}` + body.slice(end);
    onChange(newText);
    // Restore cursor
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + v.length + 4;
      ta.focus();
    }, 0);
  };

  // Preview: substitui {{var}} por valor de exemplo
  const preview = body.replace(/\{\{(\w+)\}\}/g, (_m, key) => SAMPLE_VARS[key] ?? `[${key}]`);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Variáveis disponíveis
        </label>
        <div className="flex flex-wrap gap-1">
          {["nome", "endereco", "valor", "prazo"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVar(v)}
              className="rounded px-2 py-0.5 text-xs font-mono"
              style={{ background: "var(--surface-hover)", color: "var(--text-accent)" }}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Template da mensagem
        </label>
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="w-full rounded-md border px-3 py-2 font-mono text-sm"
          style={{
            background: "var(--surface-raised)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        />
        <p className="mt-1 text-right text-xs" style={{ color: "var(--text-tertiary)" }}>
          {body.length} caracteres
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Preview
        </label>
        <div
          className="whitespace-pre-wrap rounded-md border p-3 text-sm"
          style={{
            background: "var(--surface-base)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          {preview || <span style={{ color: "var(--text-tertiary)" }}>Mensagem vazia</span>}
        </div>
      </div>
    </div>
  );
}
