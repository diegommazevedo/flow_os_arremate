/**
 * DealTimeline — Histórico de atualizações do processo.
 *
 * UX 45–50 anos:
 *   - Data em formato brasileiro por extenso
 *   - Ícones de tipo (info, sucesso, aviso, marco)
 *   - "Processo iniciado" como primeiro item sempre visível
 */

import type { PortalTimelineEvent } from "../_lib/portal-queries";

interface Props {
  events: PortalTimelineEvent[];
}

export function DealTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-gray-400 text-sm">
          Nenhuma atualização registrada ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <ol className="relative" aria-label="Histórico do processo">
        {events.map((event, i) => (
          <TimelineItem
            key={event.id}
            event={event}
            isLast={i === events.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

// ─── Item de timeline ─────────────────────────────────────────────────────────

function TimelineItem({
  event,
  isLast,
}: {
  event:  PortalTimelineEvent;
  isLast: boolean;
}) {
  const { icon, color, bgColor } = eventStyles(event.type);

  const dateLabel = event.date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
  });

  const timeLabel = event.date.toLocaleTimeString("pt-BR", {
    hour:   "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="relative flex gap-3 px-4 py-4">

      {/* Linha vertical de conexão */}
      {!isLast && (
        <div
          className="absolute left-[27px] top-[52px] bottom-0 w-0.5 bg-gray-100"
          aria-hidden
        />
      )}

      {/* Ícone do tipo */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full ${bgColor} flex items-center justify-center mt-0.5`}
        aria-hidden
      >
        <span className="text-sm">{icon}</span>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-base font-semibold ${color} leading-snug`}>
            {event.title}
          </p>
        </div>
        <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">
          {event.description}
        </p>
        <time
          dateTime={event.date.toISOString()}
          className="text-xs text-gray-400 mt-1.5 block"
        >
          {dateLabel} · {timeLabel}
        </time>
      </div>

    </li>
  );
}

// ─── Mapeamento de estilos por tipo ──────────────────────────────────────────

function eventStyles(type: PortalTimelineEvent["type"]): {
  icon:    string;
  color:   string;
  bgColor: string;
} {
  switch (type) {
    case "milestone":
      return { icon: "🏁", color: "text-blue-900",  bgColor: "bg-blue-100" };
    case "success":
      return { icon: "✅", color: "text-green-900", bgColor: "bg-green-100" };
    case "warning":
      return { icon: "⚠️", color: "text-amber-900", bgColor: "bg-amber-100" };
    case "info":
    default:
      return { icon: "📋", color: "text-gray-900",  bgColor: "bg-gray-100" };
  }
}
