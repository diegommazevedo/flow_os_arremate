/**
 * DealChat — Chat com a equipe via Rocket.Chat embed ou fallback WhatsApp.
 *
 * UX 45–50 anos:
 *   - Se Rocket.Chat disponível: iframe responsivo
 *   - Fallback: botão WhatsApp grande e claro
 *   - Título simples: "Fale com sua equipe" (não "LiveChat RC")
 */

interface Props {
  rocketRoomId:  string | null;
  corretorPhone: string;
}

export function DealChat({ rocketRoomId, corretorPhone }: Props) {
  const phone = corretorPhone.replace(/\D/g, "") || "5511999999999";
  const waMsg = encodeURIComponent("Olá! Tenho uma dúvida sobre meu processo de arrematação.");
  const rcBase = process.env["NEXT_PUBLIC_ROCKETCHAT_URL"] ?? "";

  // Se tiver sala RC configurada e URL do servidor, embeder o livechat
  if (rocketRoomId && rcBase) {
    const livechatUrl = `${rcBase}/livechat/room?roomId=${rocketRoomId}`;
    return (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-500">
            💬 Chat em tempo real com sua equipe
          </p>
        </div>
        <div className="h-[400px]">
          <iframe
            src={livechatUrl}
            title="Chat com a equipe"
            className="w-full h-full border-0"
            allow="microphone; camera"
          />
        </div>
      </div>
    );
  }

  // Fallback: cards com WhatsApp e ligação
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-sm text-gray-500">
          Fale diretamente com sua equipe de assessoria
        </p>
      </div>

      <div className="p-4 space-y-3">

        {/* WhatsApp */}
        <a
          href={`https://wa.me/${phone}?text=${waMsg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl p-4 transition-colors active:scale-[0.98] min-h-[64px]"
          aria-label="Enviar mensagem pelo WhatsApp"
        >
          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">WhatsApp</p>
            <p className="text-sm text-gray-500">Resposta em até 30 minutos nos horários comerciais</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </a>

        {/* Ligação */}
        {corretorPhone && (
          <a
            href={`tel:${corretorPhone.replace(/\D/g, "")}`}
            className="flex items-center gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-4 transition-colors active:scale-[0.98] min-h-[64px]"
            aria-label="Ligar para o consultor"
          >
            <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">Ligar agora</p>
              <p className="text-sm text-gray-500">Seg–Sex, 8h às 18h</p>
            </div>
            <svg className="w-5 h-5 text-gray-400 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        )}

        <p className="text-xs text-center text-gray-400 pt-1">
          Horário de atendimento: segunda a sexta, 8h às 18h (Brasília)
        </p>
      </div>

    </div>
  );
}
