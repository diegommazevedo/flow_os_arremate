import type { Metadata } from "next";

export const metadata: Metadata = { title: "Erro de acesso" };

interface Props {
  searchParams: Promise<{ motivo?: string }>;
}

export default async function ErroPage({ searchParams }: Props) {
  const { motivo } = await searchParams;
  const label = motivo ? decodeURIComponent(motivo) : "Ocorreu um erro inesperado";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">⚠️</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Não foi possível acessar o portal
        </h1>
        <p className="text-gray-500 text-base mb-8">{label}</p>
        <a
          href="https://wa.me/5511999999999"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl text-base transition-colors min-h-[44px] w-full"
        >
          Falar com meu consultor
        </a>
      </div>
    </div>
  );
}
