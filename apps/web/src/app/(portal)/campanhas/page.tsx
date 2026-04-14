"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { BR_UFS } from "@/lib/br-ufs";

interface CampaignCard {
  id: string;
  name: string;
  type: string;
  status: string;
  totalLeads: number;
  dossierReady: number;
  progressPct: number;
}

interface StageInfo {
  id: string;
  name: string;
  position: number;
  count: number;
}

const TIPOS_COMPRA = [
  { value: "avista", label: "A vista" },
  { value: "fgts", label: "FGTS" },
  { value: "parcelavel", label: "Parcelavel" },
] as const;

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
  const [error, setError] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  // Segmentation state
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [selectedUfs, setSelectedUfs] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [useSegment, setUseSegment] = useState(false);

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
    if (sp.get("prefill") !== "1") return;
    setError(null);
    try {
      const raw = sessionStorage.getItem("cockpit_campaign_contacts");
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids)) {
          setContactIds(ids);
          if (ids.length > 0) {
            setName((prev) =>
              prev.trim() ? prev : `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
            );
          }
        }
      }
    } catch {
      /* ignore */
    }
    setModal(true);
  }, [sp]);

  // Load stages for segmentation chips
  useEffect(() => {
    if (!modal) return;
    (async () => {
      const r = await fetch("/api/leads?funnel=1");
      if (!r.ok) return;
      const d = (await r.json()) as {
        stages: { id: string; name: string; position: number }[];
        stageCounts: Record<string, number>;
      };
      setStages(
        d.stages.map((s) => ({
          ...s,
          count: d.stageCounts[s.id] ?? 0,
        })),
      );
    })();
  }, [modal]);

  // Live preview count
  useEffect(() => {
    if (!useSegment) {
      setPreviewCount(null);
      return;
    }
    if (selectedStageIds.length === 0 && selectedTipos.length === 0 && selectedUfs.length === 0) {
      setPreviewCount(null);
      return;
    }

    const ctrl = new AbortController();
    setPreviewLoading(true);

    const params = new URLSearchParams();
    for (const id of selectedStageIds) params.append("stageIds[]", id);
    for (const t of selectedTipos) params.append("tipos[]", t);
    for (const u of selectedUfs) params.append("ufs[]", u);

    fetch(`/api/leads/count?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => {
        if (d) setPreviewCount(d.count);
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false));

    return () => ctrl.abort();
  }, [useSegment, selectedStageIds, selectedTipos, selectedUfs]);

  const toggleStage = (id: string) => {
    setSelectedStageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleTipo = (value: string) => {
    setSelectedTipos((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  };

  const toggleUf = (value: string) => {
    setSelectedUfs((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  };

  const patchCampaign = useCallback(
    async (id: string, status: "PAUSED" | "RUNNING" | "CANCELLED") => {
      if (status === "CANCELLED" && !window.confirm("Confirmar cancelamento?")) return;
      setPatchingId(id);
      try {
        const r = await fetch(`/api/campaigns/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        let d: { error?: string } = {};
        try {
          d = (await r.json()) as { error?: string };
        } catch {
          d = {};
        }
        if (!r.ok) {
          window.alert(d.error ?? "Erro ao atualizar campanha");
          return;
        }
        void load();
      } finally {
        setPatchingId(null);
      }
    },
    [load],
  );

  const createCampaign = async (draft: boolean) => {
    setError(null);
    if (!name.trim()) {
      setError("Preencha o nome da campanha.");
      return;
    }
    if (type === "WA_MESSAGE" && !waMessage.trim()) {
      setError("Preencha o texto da mensagem WA.");
      return;
    }

    const hasSegment = useSegment && (selectedStageIds.length > 0 || selectedTipos.length > 0 || selectedUfs.length > 0);

    if (!hasSegment && contactIds.length === 0) {
      setError("Selecione leads na tabela /leads e use \"Criar campanha\", ou use os filtros de segmentação.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        type,
        ratePerHour: rate,
        startImmediately: !draft,
        saveDraft: draft,
        waMessage: type === "WA_MESSAGE" ? waMessage : undefined,
      };

      if (hasSegment) {
        payload["segmentFilter"] = {
          stageIds: selectedStageIds,
          tipos: selectedTipos,
          ufs: selectedUfs,
        };
        payload["contactIds"] = [];
      } else {
        payload["contactIds"] = contactIds;
      }

      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let d: { id?: string; error?: string } = {};
      try {
        d = (await r.json()) as { id?: string; error?: string };
      } catch {
        d = {};
      }
      if (!r.ok) {
        if (r.status === 409) {
          setError(d.error ?? "Já existe uma campanha com este nome. Escolha outro.");
        } else {
          setError(d.error ?? "Erro ao criar campanha");
        }
        return;
      }
      sessionStorage.removeItem("cockpit_campaign_contacts");
      setModal(false);
      setError(null);
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
          onClick={() => {
            setError(null);
            setModal(true);
          }}
        >
          + Nova campanha
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Carregando...</p>
      ) : list.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)" }}>Nenhuma campanha ainda.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => {
            const patching = patchingId === c.id;
            const canPause = c.status === "RUNNING";
            const canResume = c.status === "PAUSED";
            const canCancel = c.status === "DRAFT" || c.status === "RUNNING" || c.status === "PAUSED";
            return (
              <div
                key={c.id}
                className="rounded-lg border p-4"
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
                  {c.totalLeads} leads - {c.dossierReady} dossies prontos - tipo {c.type}
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border px-2 py-1 text-xs font-medium"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                    disabled={patching}
                    onClick={() => router.push(`/campanhas/${c.id}`)}
                  >
                    Ver monitor
                  </button>
                  {canPause && (
                    <button
                      type="button"
                      className="rounded-lg border px-2 py-1 text-xs font-medium"
                      style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                      disabled={patching}
                      onClick={() => void patchCampaign(c.id, "PAUSED")}
                    >
                      Pausar
                    </button>
                  )}
                  {canResume && (
                    <button
                      type="button"
                      className="rounded-lg border px-2 py-1 text-xs font-medium"
                      style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                      disabled={patching}
                      onClick={() => void patchCampaign(c.id, "RUNNING")}
                    >
                      Retomar
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      className="rounded-lg border px-2 py-1 text-xs font-medium text-red-600"
                      style={{ borderColor: "var(--border-default)" }}
                      disabled={patching}
                      onClick={() => void patchCampaign(c.id, "CANCELLED")}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 space-y-3 text-sm">
              <label className="block">
                Nome
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
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
                    Dossie + motoboy
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

              {/* Segmentation toggle */}
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--border-default)" }}>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSegment}
                    onChange={(e) => setUseSegment(e.target.checked)}
                  />
                  <span style={{ color: "var(--text-primary)" }}>Usar segmento de leads</span>
                </label>

                {useSegment && (
                  <div className="mt-3 space-y-3">
                    {/* Stage chips */}
                    <div>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Stage do pipeline
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {stages.map((s) => {
                          const active = selectedStageIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleStage(s.id)}
                              className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                              style={{
                                background: active ? "var(--text-accent)" : "var(--surface-overlay)",
                                color: active ? "#fff" : "var(--text-secondary)",
                              }}
                            >
                              S{s.position} {s.name} {s.count}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tipo de compra */}
                    <div>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Tipo de compra
                      </span>
                      <div className="mt-1 flex flex-wrap gap-3">
                        {TIPOS_COMPRA.map((tc) => (
                          <label key={tc.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTipos.includes(tc.value)}
                              onChange={() => toggleTipo(tc.value)}
                            />
                            <span style={{ color: "var(--text-primary)" }}>{tc.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* UF multi-select */}
                    <div>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        UF
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {BR_UFS.map((u) => {
                          const active = selectedUfs.includes(u);
                          return (
                            <button
                              key={u}
                              type="button"
                              onClick={() => toggleUf(u)}
                              className="rounded px-2 py-0.5 text-xs font-medium transition-colors"
                              style={{
                                background: active ? "var(--text-accent)" : "var(--surface-overlay)",
                                color: active ? "#fff" : "var(--text-secondary)",
                              }}
                            >
                              {u}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Preview count */}
                    <div
                      className="rounded-lg p-2 text-center text-sm font-medium"
                      style={{ background: "var(--surface-overlay)", color: "var(--text-primary)" }}
                    >
                      {previewLoading
                        ? "Calculando..."
                        : previewCount !== null
                          ? `${previewCount} leads serao incluidos nesta campanha`
                          : "Selecione filtros para ver o preview"}
                    </div>
                  </div>
                )}
              </div>

              {!useSegment && (
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Leads selecionados: {contactIds.length}
                  {contactIds.length === 0 && (
                    <span>
                      {" "}
                      - va em <Link href="/leads">/leads</Link>, marque checkboxes e &quot;Criar campanha&quot;.
                    </span>
                  )}
                </p>
              )}
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
                onClick={() => {
                  setError(null);
                  setModal(false);
                }}
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
    <Suspense fallback={<p style={{ color: "var(--text-tertiary)" }}>Carregando...</p>}>
      <CampanhasContent />
    </Suspense>
  );
}
