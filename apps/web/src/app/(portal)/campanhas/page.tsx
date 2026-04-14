"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

interface CampaignCard {
  id: string;
  name: string;
  type: string;
  status: string;
  totalLeads: number;
  dossierReady: number;
  progressPct: number;
}

function CampanhasContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const [list, setList] = useState<CampaignCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"DOSSIER" | "WA_MESSAGE">("DOSSIER");
  const [rate, setRate] = useState(20);
  const [waMessage, setWaMessage] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/campaigns");
    if (!r.ok) {
      setList([]);
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { campaigns: CampaignCard[] };
    setList(d.campaigns);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (sp.get("prefill") === "1") {
      try {
        const raw = sessionStorage.getItem("cockpit_campaign_contacts");
        if (raw) {
          const ids = JSON.parse(raw) as string[];
          if (Array.isArray(ids)) setContactIds(ids);
        }
      } catch {
        /* ignore */
      }
      setModal(true);
    }
  }, [sp]);

  const createCampaign = async (draft: boolean) => {
    if (!name.trim()) return;
    if (contactIds.length === 0) {
      window.alert("Selecione leads na tabela /leads e use “Criar campanha”, ou cole IDs.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          contactIds,
          ratePerHour: rate,
          startImmediately: !draft,
          saveDraft: draft,
          waMessage: type === "WA_MESSAGE" ? waMessage : undefined,
        }),
      });
      const d = (await r.json()) as { id?: string; error?: string };
      if (!r.ok) {
        window.alert(d.error ?? "Erro");
        return;
      }
      sessionStorage.removeItem("cockpit_campaign_contacts");
      setModal(false);
      if (d.id) router.push(`/campanhas/${d.id}`);
      else void load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Campanhas
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Disparo em massa com limite por hora (fila Redis + worker).
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: "var(--text-accent)" }}
          onClick={() => setModal(true)}
        >
          + Nova campanha
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Carregando…</p>
      ) : list.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)" }}>Nenhuma campanha ainda.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/campanhas/${c.id}`}
              className="block rounded-lg border p-4 transition-colors hover:bg-[var(--surface-hover)]"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {c.name}
                </h2>
                <span className="shrink-0 rounded px-2 py-0.5 text-[10px] uppercase" style={{ background: "var(--surface-overlay)" }}>
                  {c.status}
                </span>
              </div>
              <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                {c.totalLeads} leads · {c.dossierReady} dossiês prontos · tipo {c.type}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-overlay)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${c.progressPct}%`, background: "var(--text-accent)" }}
                />
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {c.progressPct}% processado
              </p>
            </Link>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-xl"
            style={{ background: "var(--surface-raised)", borderColor: "var(--border-default)" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Nova campanha
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <label className="block">
                Nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
                />
              </label>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Tipo</span>
                <div className="mt-1 flex flex-col gap-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={type === "DOSSIER"}
                      onChange={() => setType("DOSSIER")}
                    />
                    Dossiê + motoboy
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={type === "WA_MESSAGE"}
                      onChange={() => setType("WA_MESSAGE")}
                    />
                    Mensagem WA
                  </label>
                </div>
              </div>
              {type === "WA_MESSAGE" && (
                <label className="block">
                  Texto WA
                  <textarea
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded border px-2 py-1"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
                  />
                </label>
              )}
              <label className="block">
                Limite / hora
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value) || 20)}
                  className="mt-1 w-full rounded border px-2 py-1"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
                />
              </label>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Leads selecionados: {contactIds.length}
                {contactIds.length === 0 && (
                  <span>
                    {" "}
                    — vá em <Link href="/leads">/leads</Link>, marque checkboxes e “Criar campanha”.
                  </span>
                )}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-white"
                style={{ background: "var(--text-accent)" }}
                disabled={busy}
                onClick={() => void createCampaign(false)}
              >
                Criar e iniciar
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border-default)" }}
                disabled={busy}
                onClick={() => void createCampaign(true)}
              >
                Salvar rascunho
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm"
                onClick={() => setModal(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampanhasPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--text-tertiary)" }}>Carregando…</p>}>
      <CampanhasContent />
    </Suspense>
  );
}
