"use client";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_CONTACT: { label: "Pendente", color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.06)" },
  CONTACTED:       { label: "Contactado", color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  ACCEPTED:        { label: "Aceito", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  IN_PROGRESS:     { label: "Em andamento", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
  COMPLETED:       { label: "Concluído", color: "var(--color-success)", bg: "rgba(34,197,94,0.12)" },
  REJECTED:        { label: "Rejeitado", color: "var(--color-q1)", bg: "rgba(232,64,64,0.12)" },
  NO_RESPONSE:     { label: "Sem resposta", color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.04)" },
  CANCELLED:       { label: "Cancelado", color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.04)" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.06)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}
