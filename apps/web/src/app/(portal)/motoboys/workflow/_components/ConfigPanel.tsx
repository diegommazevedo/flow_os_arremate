"use client";

import { useState, useEffect } from "react";

const EVIDENCE_OPTIONS = [
  { value: "PHOTO_EXTERIOR", label: "Foto fachada" },
  { value: "PHOTO_SURROUNDINGS", label: "Foto vizinhança" },
  { value: "PHOTO_ACCESS", label: "Foto acesso" },
  { value: "VIDEO_EXTERIOR", label: "Vídeo exterior" },
  { value: "VIDEO_SURROUNDINGS", label: "Vídeo vizinhança" },
  { value: "AUDIO_DESCRIPTION", label: "Áudio descritivo" },
  { value: "DOCUMENT_PHOTO", label: "Foto documento" },
];

const DELAY_OPTIONS = [
  { value: 3600000, label: "1 hora" },
  { value: 7200000, label: "2 horas" },
  { value: 14400000, label: "4 horas" },
  { value: 21600000, label: "6 horas" },
  { value: 43200000, label: "12 horas" },
];

interface Config {
  agentLimit: number;
  followupDelayMs: number;
  deadlineHours: number;
  priceDefault: number;
  currency: string;
  evidenceTypes: string[];
  evidenceMinimum: number;
  autoRetry: boolean;
}

interface Props {
  workflowId: string;
}

export function ConfigPanel({ workflowId }: Props) {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/field-workflows/${workflowId}/config`)
      .then((r) => r.json())
      .then((d) => setConfig(d.config));
  }, [workflowId]);

  if (!config) return <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Carregando config...</p>;

  const update = (key: keyof Config, value: unknown) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await fetch(`/api/field-workflows/${workflowId}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
  };

  const inputStyle = { background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Configurações</h3>

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Limite de agentes</label>
        <input type="number" min={1} max={20} value={config.agentLimit}
          onChange={(e) => update("agentLimit", Number(e.target.value))}
          className="w-full rounded-md border px-3 py-1.5 text-sm" style={inputStyle} />
      </div>

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Delay follow-up</label>
        <select value={config.followupDelayMs}
          onChange={(e) => update("followupDelayMs", Number(e.target.value))}
          className="w-full rounded-md border px-3 py-1.5 text-sm" style={inputStyle}>
          {DELAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Prazo de vistoria (horas)</label>
        <input type="number" min={1} value={config.deadlineHours}
          onChange={(e) => update("deadlineHours", Number(e.target.value))}
          className="w-full rounded-md border px-3 py-1.5 text-sm" style={inputStyle} />
      </div>

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Preço padrão (R$)</label>
        <input type="number" min={0} step={0.01} value={config.priceDefault}
          onChange={(e) => update("priceDefault", Number(e.target.value))}
          className="w-full rounded-md border px-3 py-1.5 text-sm" style={inputStyle} />
      </div>

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Tipos de evidência</label>
        <div className="space-y-1">
          {EVIDENCE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
              <input type="checkbox" checked={config.evidenceTypes.includes(o.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...config.evidenceTypes, o.value]
                    : config.evidenceTypes.filter((t) => t !== o.value);
                  update("evidenceTypes", next);
                }} />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Mínimo de evidências</label>
        <input type="number" min={0} value={config.evidenceMinimum}
          onChange={(e) => update("evidenceMinimum", Number(e.target.value))}
          className="w-full rounded-md border px-3 py-1.5 text-sm" style={inputStyle} />
      </div>

      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
        <input type="checkbox" checked={config.autoRetry}
          onChange={(e) => update("autoRetry", e.target.checked)} />
        Auto-retry se sem resposta
      </label>

      <button onClick={save} disabled={saving}
        className="w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: "var(--text-accent)" }}>
        {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar Config"}
      </button>
    </div>
  );
}
