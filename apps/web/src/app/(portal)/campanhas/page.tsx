"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { BR_UFS } from "@/lib/br-ufs";
import { CampaignActions, type CampaignRow } from "./_components/CampaignActions";

type CampaignCard = CampaignRow;

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

type ViewMode = "lista" | "kanban";

/** Quatro colunas: rascunho · em andamento · pausada · encerradas (concluída + cancelada) */
const KANBAN_COLUMNS: { keys: string[]; label: string }[] = [
  { keys: ["DRAFT"], label: "Rascunho" },
  { keys: ["RUNNING"], label: "Em andamento" },
  { keys: ["PAUSED"], label: "Pausada" },
  { keys: ["COMPLETED", "CANCELLED"], label: "Encerradas" },
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#6b7280",
  RUNNING: "#2563eb",
  PAUSED: "#d97706",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
};

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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "lista";
    const v = window.localStorage.getItem("campanhas_view");
    return v === "kanban" ? "kanban" : "lista";
  });
  const [showArchived, setShowArchived] = useState(false);

  // Segmentation state
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [selectedUfs, setSelectedUfs] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [useSegment, setUseSegment] = useState(false);

  const load = useCallback(async () => {
    const url = showArchived ? "/api/campaigns?includeArchived=true" : "/api/campaigns";
    const r = await fetch(url);
    if (!r.ok) {
      setList([]);
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { campaigns: CampaignCard[] };
    setList(d.campaigns);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      window.localStorage.setItem("campanhas_view", viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

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

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderCampaignCard(c: CampaignCard) {
    return (
      <div
        key={c.id}
        className={`rounded-lg border p-4 ${c.archivedAt ? "opacity-60" : ""}`}
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
      >
        <div className="flex items-start justify-between gap-2">
          <h2
            className="cursor-pointer font-medium hover:underline"
            style={{ color: "var(--text-primary)" }}
            onClick={() => router.push(`/campanhas/${c.id}`)}
          >
            {c.name}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {c.archivedAt && (
              <span className="rounded px-1.5 py-0.5 text-[10px] uppercase" style={{ background: "#e5e7eb", color: "#6b7280" }}>
                Arquivada
              </span>
            )}
            <span
              className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
              style={{ background: STATUS_COLORS[c.status] ?? "#6b7280" }}
            >
              {c.status}
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {c.totalLeads} leads · {c.dossierReady} dossiês prontos · {c.type}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-overlay)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${c.progressPct}%`, background: STATUS_COLORS[c.status] ?? "var(--text-accent)" }}
          />
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {c.progressPct}% processado
        </p>
        <div className="mt-3">
          <CampaignActions campaign={c} onRefresh={() => void load()} />
        </div>
      </div>
    );
  }

  // ── Kanban view ───────────────────────────────────────────────────────────

  function renderKanban() {
    const active = list.filter((c) => !c.archivedAt);
    const archived = list.filter((c) => !!c.archivedAt);

    return (
      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((col) => {
            const items = active.filter((c) => col.keys.includes(c.status));
            const dotColor = STATUS_COLORS[col.keys[0] ?? "DRAFT"] ?? "#6b7280";
            return (
              <div
                key={col.label}
                className="min-w-[220px] flex-1 rounded-lg border p-3"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-base)" }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: dotColor }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {col.label}
                  </span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--surface-overlay)", color: "var(--text-tertiary)" }}>
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Nenhuma
                    </p>
                  ) : (
                    items.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border p-2.5"
                        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
                      >
                        <h3
                          className="cursor-pointer text-sm font-medium hover:underline"
                          style={{ color: "var(--text-primary)" }}
                          onClick={() => router.push(`/campanhas/${c.id}`)}
                        >
                          {c.name}
                        </h3>
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {c.totalLeads} leads · {c.progressPct}%
                        </p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-overlay)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${c.progressPct}%`, background: STATUS_COLORS[c.status] }}
                          />
                        </div>
                        <div className="mt-2">
                          <CampaignActions campaign={c} compact onRefresh={() => void load()} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showArchived && archived.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text-tertiary)" }}>
              Arquivadas ({archived.length})
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {archived.map(renderCampaignCard)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Lista view ────────────────────────────────────────────────────────────

  function formatShortDate(iso: string) {
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function renderLista() {
    const active = list.filter((c) => !c.archivedAt);
    const archived = list.filter((c) => !!c.archivedAt);

    const tableBlock = (rows: CampaignCard[], sectionTitle?: string) => (
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        {sectionTitle ? (
          <div className="border-b px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)" }}>
            {sectionTitle}
          </div>
        ) : null}
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr style={{ background: "var(--surface-overlay)" }}>
              <th className="border-b px-3 py-2 font-medium" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Nome
              </th>
              <th className="border-b px-2 py-2 font-medium whitespace-nowrap" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Leads
              </th>
              <th className="border-b px-2 py-2 font-medium whitespace-nowrap" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Status
              </th>
              <th className="border-b px-2 py-2 font-medium" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)", width: 200 }}>
                Progresso
              </th>
              <th className="border-b px-2 py-2 font-medium whitespace-nowrap" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                Criada
              </th>
              <th className="border-b px-2 py-2 font-medium" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)", minWidth: 280 }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={c.archivedAt ? "opacity-70" : undefined} style={{ background: "var(--surface-raised)" }}>
                <td className="border-b px-3 py-2 align-middle" style={{ borderColor: "var(--border-subtle)" }}>
                  <button
                    type="button"
                    className="max-w-[220px] truncate text-left font-medium hover:underline"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => router.push(`/campanhas/${c.id}`)}
                  >
                    {c.name}
                  </button>
                  {c.archivedAt ? (
                    <span className="ml-2 rounded px-1 py-0.5 text-[9px] font-semibold uppercase" style={{ background: "#e5e7eb", color: "#6b7280" }}>
                      Arquivada
                    </span>
                  ) : null}
                </td>
                <td className="border-b px-2 py-2 align-middle tabular-nums" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                  {c.totalLeads}
                </td>
                <td className="border-b px-2 py-2 align-middle whitespace-nowrap" style={{ borderColor: "var(--border-subtle)" }}>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white"
                    style={{ background: STATUS_COLORS[c.status] ?? "#6b7280" }}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="border-b px-2 py-2 align-middle" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-overlay)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.progressPct}%`, background: STATUS_COLORS[c.status] ?? "var(--text-accent)" }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                      {c.progressPct}%
                    </span>
                  </div>
                </td>
                <td className="border-b px-2 py-2 align-middle whitespace-nowrap text-xs" style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)" }}>
                  {formatShortDate(c.createdAt)}
                </td>
                <td className="border-b px-2 py-2 align-top" style={{ borderColor: "var(--border-subtle)" }}>
                  <CampaignActions campaign={c} compact onRefresh={() => void load()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    return (
      <div className="space-y-4">
        {active.length === 0 && archived.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)" }}>Nenhuma campanha ainda.</p>
        ) : (
          <>
            {active.length > 0 ? tableBlock(active) : (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Nenhuma campanha ativa. Ative &quot;Mostrar arquivadas&quot; para ver as arquivadas.
              </p>
            )}
            {showArchived && archived.length > 0 ? tableBlock(archived, `Arquivadas (${archived.length})`) : null}
          </>
        )}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Campanhas
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Disparo em massa com limite por hora (fila Redis + worker).
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Toolbar: view toggle + archived filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border" style={{ borderColor: "var(--border-default)" }}>
          <button
            type="button"
            title="Lista compacta (tabela)"
            className="rounded-l-lg px-3 py-1 text-xs font-medium"
            style={{
              background: viewMode === "lista" ? "var(--text-accent)" : "transparent",
              color: viewMode === "lista" ? "#fff" : "var(--text-secondary)",
            }}
            onClick={() => setViewMode("lista")}
          >
            ☰ Lista
          </button>
          <button
            type="button"
            title="Kanban por status"
            className="rounded-r-lg px-3 py-1 text-xs font-medium"
            style={{
              background: viewMode === "kanban" ? "var(--text-accent)" : "transparent",
              color: viewMode === "kanban" ? "#fff" : "var(--text-secondary)",
            }}
            onClick={() => setViewMode("kanban")}
          >
            ⊞ Kanban
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-tertiary)" }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Mostrar arquivadas
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Carregando...</p>
      ) : viewMode === "kanban" ? (
        renderKanban()
      ) : (
        renderLista()
      )}

      {/* Create modal */}
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
                className={`rounded-lg px-3 py-1.5 text-sm text-white ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
                style={{ background: "var(--text-accent)" }}
                disabled={busy}
                onClick={() => void createCampaign(false)}
              >
                {busy ? "Criando..." : "Criar e iniciar"}
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
                style={{ borderColor: "var(--border-default)" }}
                disabled={busy}
                onClick={() => void createCampaign(true)}
              >
                {busy ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm"
                disabled={busy}
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
