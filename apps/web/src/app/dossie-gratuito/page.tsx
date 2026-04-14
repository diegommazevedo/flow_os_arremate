"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

const BR_UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

const TIPOS_PAGAMENTO = [
  { value: "avista", label: "A vista" },
  { value: "fgts", label: "FGTS" },
  { value: "parcelavel", label: "Parcelavel" },
] as const;

function DossieGratuitoForm() {
  const sp = useSearchParams();
  const ref = sp.get("ref") ?? "";

  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [uf, setUf] = useState("");
  const [valor, setValor] = useState("");
  const [tipoPagamento, setTipoPagamento] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Fetch workspace name for header personalization
  useEffect(() => {
    if (!ref) return;
    fetch(`/api/public/dossier-request?ref=${encodeURIComponent(ref)}`, { method: "HEAD" })
      .catch(() => {});
    // We don't have a public workspace info endpoint, so just show the ref as slug
    setWorkspaceName(ref.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }, [ref]);

  const maskPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const maskedPhone = telefone
    ? `(${telefone.slice(0, 2)}) ${telefone.slice(2, 3)}****-${telefone.slice(-2)}`
    : "";

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!nome.trim()) { setError("Preencha o nome."); return; }
    if (telefone.replace(/\D/g, "").length < 10) { setError("WhatsApp invalido."); return; }
    if (!endereco.trim()) { setError("Preencha o endereco do imovel."); return; }
    if (!uf) { setError("Selecione a UF."); return; }
    if (!ref) { setError("Link invalido — parametro ref ausente."); return; }

    setBusy(true);
    try {
      const r = await fetch("/api/public/dossier-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.replace(/\D/g, ""),
          endereco: endereco.trim(),
          uf,
          valor: valor.trim() || undefined,
          tipoPagamento: tipoPagamento || undefined,
          obs: obs.trim() || undefined,
          ref,
        }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) {
        setError(d.error ?? "Erro ao enviar solicitacao.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }, [nome, telefone, endereco, uf, valor, tipoPagamento, obs, ref]);

  if (!ref) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-gray-400 max-w-md">
          <p className="text-lg font-medium text-white">Link invalido</p>
          <p className="mt-2 text-sm">
            O parametro <code className="text-gray-300">?ref=</code> esta ausente.
            Solicite um link valido ao corretor.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
        <div className="max-w-md rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-900/30">
            <span className="text-3xl text-green-400">&#10003;</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Solicitacao recebida!</h1>
          <p className="mt-3 text-sm text-gray-400">
            Nossa equipe ja foi acionada para vistoriar o imovel.
            Voce recebera o relatorio completo no WhatsApp{" "}
            <span className="font-medium text-gray-300">{maskedPhone}</span>{" "}
            em ate 48h.
          </p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            onClick={() => {
              setSubmitted(false);
              setNome("");
              setTelefone("");
              setEndereco("");
              setUf("");
              setValor("");
              setTipoPagamento("");
              setObs("");
            }}
          >
            Fazer outra solicitacao
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 md:p-8">
        {/* Header */}
        <div className="text-center">
          {workspaceName && (
            <p className="text-xs font-medium uppercase tracking-wider text-indigo-400">
              {workspaceName}
            </p>
          )}
          <h1 className="mt-1 text-xl font-semibold text-white">
            Dossie gratuito do seu imovel
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Preencha e receba relatorio completo em ate 48h via WhatsApp
          </p>
        </div>

        {/* Form */}
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-gray-300">Nome completo *</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Seu nome"
              aria-label="Nome completo"
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-300">WhatsApp *</span>
            <input
              value={maskPhone(telefone)}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="(11) 99999-9999"
              aria-label="WhatsApp"
              inputMode="tel"
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-300">Endereco do imovel *</span>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Rua, numero, bairro, cidade"
              aria-label="Endereco do imovel"
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-300">UF *</span>
            <select
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              aria-label="UF"
            >
              <option value="">Selecione</option>
              {BR_UFS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-gray-300">Valor estimado</span>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="R$ 200.000"
              aria-label="Valor estimado"
            />
          </label>

          <div className="text-sm">
            <span className="text-gray-300">Como pretende pagar?</span>
            <div className="mt-2 flex flex-wrap gap-3">
              {TIPOS_PAGAMENTO.map((tp) => (
                <label key={tp.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tipoPagamento"
                    value={tp.value}
                    checked={tipoPagamento === tp.value}
                    onChange={(e) => setTipoPagamento(e.target.value)}
                    className="accent-indigo-500"
                  />
                  <span className="text-gray-300">{tp.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="text-gray-300">Observacoes (opcional)</span>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Alguma informacao extra sobre o imovel?"
              aria-label="Observacoes"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSubmit()}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            aria-label="Solicitar dossie gratuito"
          >
            {busy ? "Enviando..." : "Solicitar dossie gratuito"}
          </button>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Voce recebera o relatorio via WhatsApp em ate 48h &middot; Sem custo
        </p>
      </div>
    </div>
  );
}

export default function DossieGratuitoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-950">
          <p className="text-gray-400">Carregando...</p>
        </div>
      }
    >
      <DossieGratuitoForm />
    </Suspense>
  );
}
