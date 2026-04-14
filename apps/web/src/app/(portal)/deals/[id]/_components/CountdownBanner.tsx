"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface EditalData {
  id: string;
  status: string;
  leilaoDate: string | null;
  leilaoModalidade: string | null;
  lanceMinimo: number | null;
  urgencyLevel: string;
  deliveryContext: string;
  prazoBoletoPago: string | null;
  horasAteEvento: number | null;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CountdownBanner({ dealId }: { dealId: string }) {
  const [edital, setEdital] = useState<EditalData | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [hunting, setHunting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}/edital`);
    if (!r.ok) { setLoading(false); return; }
    const data = await r.json();
    setEdital(data.edital);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  // Timer
  useEffect(() => {
    if (!edital?.leilaoDate) return;
    const target = new Date(edital.leilaoDate).getTime();
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, target - Date.now()));
    }, 1000);
    setTimeLeft(Math.max(0, target - Date.now()));
    return () => clearInterval(id);
  }, [edital?.leilaoDate]);

  // Pós-arremate: countdown para boleto
  useEffect(() => {
    if (!edital?.prazoBoletoPago || edital.deliveryContext !== "POS_ARREMATE") return;
    const target = new Date(edital.prazoBoletoPago).getTime();
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, target - Date.now()));
    }, 1000);
    setTimeLeft(Math.max(0, target - Date.now()));
    return () => clearInterval(id);
  }, [edital?.prazoBoletoPago, edital?.deliveryContext]);

  const hunt = async () => {
    setHunting(true);
    await fetch(`/api/deals/${dealId}/edital/hunt`, { method: "POST" });
    setHunting(false);
    setTimeout(load, 3000);
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    await fetch(`/api/deals/${dealId}/edital/upload`, { method: "POST", body: fd });
    load();
  };

  if (loading) return null;

  // Sem edital
  if (!edital) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3">
        <span className="text-sm text-gray-400">📋 Edital não encontrado</span>
        <button onClick={hunt} disabled={hunting}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-gray-950 disabled:opacity-50">
          {hunting ? "Buscando..." : "Buscar automaticamente"}
        </button>
        <label className="cursor-pointer rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300">
          Upload PDF
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </label>
      </div>
    );
  }

  // Processando
  if (edital.status === "PROCESSING") {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        <span className="text-sm text-amber-300">Processando edital...</span>
      </div>
    );
  }

  // Pendente (sem dados extraídos)
  if (edital.status === "PENDING") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3">
        <span className="text-sm text-gray-400">📋 Edital pendente de processamento</span>
      </div>
    );
  }

  // Falhou
  if (edital.status === "FAILED") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3">
        <span className="text-sm text-red-400">❌ Falha ao processar edital</span>
        <label className="cursor-pointer rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300">
          Reenviar PDF
          <input type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </label>
      </div>
    );
  }

  // DONE — com dados extraídos
  const urgency = edital.urgencyLevel;
  const isPos = edital.deliveryContext === "POS_ARREMATE";

  const borderColor = urgency === "CRITICAL" ? "border-red-500"
    : urgency === "HIGH" ? "border-amber-500"
    : urgency === "POS_48H" ? "border-purple-500"
    : "border-blue-500";

  const bgColor = urgency === "CRITICAL" ? "bg-red-950/30"
    : urgency === "HIGH" ? "bg-amber-950/20"
    : urgency === "POS_48H" ? "bg-purple-950/20"
    : "bg-blue-950/20";

  const pulse = urgency === "CRITICAL" ? "animate-pulse" : "";

  return (
    <div className={`mb-4 rounded-xl border-2 ${borderColor} ${bgColor} ${pulse} px-4 py-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!isPos ? (
            <>
              <span className="font-mono text-xl font-bold text-white">{formatCountdown(timeLeft)}</span>
              <div className="text-sm">
                <span className="text-gray-300">
                  {edital.leilaoModalidade ?? "Leilão"}
                </span>
                {edital.lanceMinimo && (
                  <span className="ml-2 text-gray-400">
                    Lance mín: R$ {(edital.lanceMinimo / 100).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-lg">⚡</span>
              <div className="text-sm">
                <span className="font-medium text-purple-300">Pós-arremate</span>
                <span className="ml-2 text-gray-400">Boleto vence em {formatCountdown(timeLeft)}</span>
              </div>
            </>
          )}
        </div>

        {urgency === "CRITICAL" && (
          <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
            URGENTE
          </span>
        )}
      </div>
    </div>
  );
}
