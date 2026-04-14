"use client";

import { useCallback, useEffect, useState } from "react";

const PANEL = "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";

export function DossierSettingsCard() {
  const [autoDispatch, setAutoDispatch] = useState(false);
  const [delayMin, setDelayMin] = useState(0);
  const [gateA, setGateA] = useState(48);
  const [gateB, setGateB] = useState(72);
  const [footer, setFooter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/workspace/settings");
    if (!r.ok) return;
    const j = (await r.json()) as { settings: Record<string, unknown> };
    const d = (j.settings["dossier"] ?? {}) as Record<string, unknown>;
    setAutoDispatch(Boolean(d["autoDispatchDossier"]));
    setDelayMin(typeof d["autoDispatchDelayMinutes"] === "number" ? d["autoDispatchDelayMinutes"] : 0);
    setGateA(typeof d["gateATimeoutHours"] === "number" ? d["gateATimeoutHours"] : 48);
    setGateB(typeof d["gateBTimeoutHours"] === "number" ? d["gateBTimeoutHours"] : 72);
    setFooter(typeof d["reportFooterText"] === "string" ? d["reportFooterText"] : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    await fetch("/api/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoDispatchDossier: autoDispatch,
        autoDispatchDelayMinutes: delayMin,
        gateATimeoutHours: gateA,
        gateBTimeoutHours: gateB,
        reportFooterText: footer,
      }),
    });
    void load();
  };

  if (loading) return <div className={PANEL}>Carregando…</div>;

  return (
    <div className={PANEL}>
      <h2 className="mb-3 font-semibold text-white">Dossiê &amp; entrega</h2>
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2 text-gray-300">
          <input type="checkbox" checked={autoDispatch} onChange={(e) => setAutoDispatch(e.target.checked)} />
          Enviar dossiê ao lead automaticamente
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Atraso (minutos, 0 = imediato)</span>
          <input
            type="number"
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-white"
            value={delayMin}
            onChange={(e) => setDelayMin(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Timeout Gate A (horas)</span>
          <input type="number" className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-white" value={gateA} onChange={(e) => setGateA(Number(e.target.value))} />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Timeout Gate B — bypass documental (horas)</span>
          <input type="number" className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-white" value={gateB} onChange={(e) => setGateB(Number(e.target.value))} />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Rodapé PDF</span>
          <textarea className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-white" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
        </label>
        <button type="button" onClick={() => void save()} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-gray-950">
          Guardar
        </button>
      </div>
    </div>
  );
}
