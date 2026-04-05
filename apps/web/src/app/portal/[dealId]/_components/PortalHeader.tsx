/**
 * PortalHeader — Header fixo do portal do arrematante.
 *
 * UX 45–50 anos:
 *   - Logo grande e legível
 *   - Nome do arrematante visível
 *   - Botão de ajuda (WhatsApp) sempre acessível
 */

interface Props {
  actorName:     string;
  corretorPhone: string;
  corretorName:  string;
}

export function PortalHeader({ actorName, corretorPhone, corretorName }: Props) {
  const phone = corretorPhone.replace(/\D/g, "") || "5511999999999";
  const msg   = encodeURIComponent(`Olá, ${corretorName}! Preciso de ajuda com meu processo.`);

  // Primeiro nome do arrematante
  const firstName = actorName.split(" ")[0] ?? actorName;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 h-[72px] flex items-center justify-between">

        {/* Logo + saudação */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg" aria-hidden>🏠</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 leading-none">Arrematador Caixa</p>
            <p className="text-base font-bold text-gray-900 leading-tight">
              Olá, {firstName}!
            </p>
          </div>
        </div>

        {/* Botão de ajuda */}
        <a
          href={`https://wa.me/${phone}?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 font-semibold px-3 py-2 rounded-xl text-sm transition-colors min-h-[44px] border border-green-200"
          aria-label={`Falar com ${corretorName} pelo WhatsApp`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          <span className="hidden sm:inline">Ajuda</span>
        </a>

      </div>
    </header>
  );
}
