"use client";

import type { DragEvent } from "react";

const STEP_TYPES = [
  { type: "SEND_MESSAGE",      label: "Enviar Mensagem",  icon: "💬" },
  { type: "WAIT_RESPONSE",     label: "Aguardar Resposta", icon: "⏳" },
  { type: "WAIT_DELAY",        label: "Aguardar Tempo",    icon: "⏱️" },
  { type: "CONDITION",         label: "Condição",          icon: "🔀" },
  { type: "UPDATE_STATUS",     label: "Atualizar Status",  icon: "✅" },
  { type: "SCHEDULE_FOLLOWUP", label: "Agendar Follow-up", icon: "🔔" },
  { type: "DISPATCH_NEXT",     label: "Próximo Agente",    icon: "🔄" },
];

export function StepPalette() {
  const onDragStart = (event: DragEvent, type: string, label: string) => {
    event.dataTransfer.setData("application/reactflow-type", type);
    event.dataTransfer.setData("application/reactflow-label", label);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
        Paleta
      </h3>
      {STEP_TYPES.map((s) => (
        <div
          key={s.type}
          draggable
          onDragStart={(e) => onDragStart(e, s.type, s.label)}
          className="flex cursor-grab items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors active:cursor-grabbing"
          style={{
            borderColor: "var(--border-subtle)",
            background: "var(--surface-raised)",
            color: "var(--text-primary)",
          }}
        >
          <span>{s.icon}</span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
