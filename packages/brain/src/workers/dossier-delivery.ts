/**
 * Dossier Delivery — mensagem contextual PRÉ/PÓS arremate.
 * Única fonte de verdade para a mensagem WA ao lead.
 * Chamado pelo dossier-consolidator ao fazer autoDispatch.
 */

interface DeliveryParams {
  leadName: string;
  endereco: string;
  recommendation: "RECOMENDAR" | "CAUTELA" | "NAO_RECOMENDAR";
  score: number;
  reportUrl: string;
  edital: {
    urgencyLevel?: string;
    horasAteEvento?: number | null;
    prazoBoletoPago?: string | Date | null;
    debitosEdital?: Array<{ tipo: string; valor: number; descricao?: string }> | null;
  } | null;
  deliveryContext: "PRE_ARREMATE" | "POS_ARREMATE";
}

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function buildProximosPassos(
  edital: DeliveryParams["edital"],
  recommendation: string,
): string[] {
  const passos: string[] = [];
  if (edital?.debitosEdital?.length) {
    const total = edital.debitosEdital.reduce((s, d) => s + (d.valor ?? 0), 0);
    if (total > 0) {
      passos.push(`Providenciar quitação de débitos: ~R$ ${(total / 100).toLocaleString("pt-BR")}`);
    }
  }
  if (recommendation === "CAUTELA") {
    passos.push("Verificar pendências jurídicas antes de pagar o boleto");
  }
  passos.push("Pagar o boleto dentro do prazo");
  passos.push("Agendar transferência de titularidade");
  return passos;
}

export function buildDeliveryMessage(params: DeliveryParams): string {
  const { leadName, endereco, recommendation, score, reportUrl, edital, deliveryContext } = params;

  const recEmoji = recommendation === "RECOMENDAR" ? "✅"
    : recommendation === "CAUTELA" ? "⚠️" : "❌";
  const recTexto = recommendation === "RECOMENDAR" ? "RECOMENDAMOS O ARREMATE"
    : recommendation === "CAUTELA" ? "ARREMATE COM CAUTELA"
    : "NÃO RECOMENDAMOS";

  // Bloco de urgência
  let urgenciaBloco = "";
  if (edital?.urgencyLevel === "CRITICAL") {
    const horas = edital.horasAteEvento ?? 0;
    urgenciaBloco = `\n🔴 *ATENÇÃO: Leilão em ${horas}h — prazo crítico!*`;
  } else if (edital?.urgencyLevel === "HIGH") {
    const horas = edital.horasAteEvento ?? 0;
    urgenciaBloco = `\n⏰ Leilão em aproximadamente ${horas}h`;
  } else if (edital?.urgencyLevel === "POS_48H") {
    const prazo = edital.prazoBoletoPago
      ? formatDate(edital.prazoBoletoPago)
      : "48h";
    urgenciaBloco = `\n⚡ *Boleto vence em: ${prazo} — não perca o prazo!*`;
  }

  if (deliveryContext === "PRE_ARREMATE") {
    return `Olá *${leadName}*! 🏠

Seu relatório de viabilidade está pronto.

📍 ${endereco}
📊 Score de risco: *${score}/10*
${recEmoji} *${recTexto}*
${urgenciaBloco}

📄 Acesse o relatório completo:
${reportUrl}
_Válido por 7 dias_

Qualquer dúvida, estamos aqui! 👋`;
  }

  // POS_ARREMATE
  const proximosPassos = buildProximosPassos(edital, recommendation);
  return `Parabéns pelo arremate, *${leadName}*! 🎉

Seu relatório expresso está pronto.

📍 ${endereco}
${urgenciaBloco}

*O que fazer agora:*
${proximosPassos.map(p => `• ${p}`).join("\n")}

📄 Relatório completo:
${reportUrl}

Nossa equipe está disponível para qualquer dúvida! 🤝`;
}
