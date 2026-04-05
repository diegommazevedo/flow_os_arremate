/**
 * NextStepCard — Destaque visual do próximo passo para o arrematante.
 *
 * UX 45–50 anos:
 *   - Linguagem direta e simples: "O que você precisa fazer agora"
 *   - Cor de urgência clara (âmbar/vermelho se urgent)
 *   - Fonte grande, botão grande
 */

interface NextStep {
  title:       string;
  description: string;
  urgent:      boolean;
  slaLabel:    string | null;
}

interface Props {
  nextStep: NextStep;
}

export function NextStepCard({ nextStep }: Props) {
  const { title, description, urgent, slaLabel } = nextStep;

  return (
    <div
      className={[
        "rounded-2xl border-2 overflow-hidden",
        urgent
          ? "border-amber-400 bg-amber-50"
          : "border-blue-200 bg-blue-50",
      ].join(" ")}
      role="region"
      aria-label="Próximo passo do processo"
    >
      {/* Cabeçalho */}
      <div
        className={[
          "px-4 py-2 flex items-center justify-between",
          urgent ? "bg-amber-400" : "bg-blue-600",
        ].join(" ")}
      >
        <span className="text-white text-sm font-bold uppercase tracking-wide">
          {urgent ? "⚡ Ação necessária" : "🔵 Próximo passo"}
        </span>
        {slaLabel && (
          <span className="text-white text-xs font-semibold opacity-90">
            {slaLabel}
          </span>
        )}
      </div>

      {/* Conteúdo */}
      <div className="px-4 py-4">
        <h3
          className={[
            "text-xl font-bold mb-2",
            urgent ? "text-amber-900" : "text-blue-900",
          ].join(" ")}
        >
          {title}
        </h3>
        <p
          className={[
            "text-base leading-relaxed",
            urgent ? "text-amber-800" : "text-blue-800",
          ].join(" ")}
        >
          {description}
        </p>
      </div>

      {/* Rodapé com dica */}
      <div
        className={[
          "px-4 py-2 border-t flex items-center gap-2",
          urgent ? "border-amber-300 bg-amber-100/50" : "border-blue-200 bg-blue-100/50",
        ].join(" ")}
      >
        <span className="text-base" aria-hidden>💡</span>
        <p className={`text-xs ${urgent ? "text-amber-700" : "text-blue-700"}`}>
          {urgent
            ? "Entre em contato com sua equipe o quanto antes."
            : "Sua equipe está acompanhando e entrará em contato quando necessário."}
        </p>
      </div>
    </div>
  );
}
