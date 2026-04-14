"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  SEND_MESSAGE:      { icon: "💬", color: "#3B82F6" },
  WAIT_RESPONSE:     { icon: "⏳", color: "#F59E0B" },
  WAIT_DELAY:        { icon: "⏱️", color: "#F59E0B" },
  CONDITION:         { icon: "🔀", color: "#8B5CF6" },
  UPDATE_STATUS:     { icon: "✅", color: "#22C55E" },
  SCHEDULE_FOLLOWUP: { icon: "🔔", color: "#E84040" },
  DISPATCH_NEXT:     { icon: "🔄", color: "#EC4899" },
};

export interface StepNodeData {
  key: string;
  label: string;
  type: string;
  template?: { name: string; body: string; variables: string[] } | null;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export function StepNode({ data, selected }: NodeProps) {
  const d = data as StepNodeData;
  const cfg = TYPE_CONFIG[d.type] ?? { icon: "📦", color: "var(--text-tertiary)" };

  return (
    <div
      className="min-w-[180px] rounded-lg border-2 px-4 py-3 shadow-md transition-shadow"
      style={{
        background: "var(--surface-overlay)",
        borderColor: selected ? "var(--text-accent)" : cfg.color,
        boxShadow: selected ? `0 0 0 2px var(--text-accent)` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: cfg.color, width: 10, height: 10 }} />

      <div className="flex items-center gap-2">
        <span className="text-lg">{cfg.icon}</span>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{d.label}</p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{d.type.replace(/_/g, " ").toLowerCase()}</p>
        </div>
      </div>

      {d.type === "SEND_MESSAGE" && d.template && (
        <p className="mt-2 truncate text-xs" style={{ color: "var(--text-secondary)", maxWidth: 200 }}>
          {d.template.body.slice(0, 60)}...
        </p>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: cfg.color, width: 10, height: 10 }} />
    </div>
  );
}
