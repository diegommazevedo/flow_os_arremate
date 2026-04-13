"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TagSelector, type TagLite } from "@/components/TagSelector";
import { BR_UFS } from "@/lib/br-ufs";

export interface LeadRow {
  id: string;
  name: string;
  phoneMasked: string;
  phone: string | null;
  imovel: string;
  cidade: string;
  uf: string;
  tags: TagLite[];
  leadLifecycle: string;
  pipelineStage: { id: string; name: string; position: number } | null;
  dossier: { bucket: "none" | "progress" | "ready"; status: string | null; score: number | null };
  lastActivityAt: string;
}

export interface FunnelStage {
  id: string;
  name: string;
  position: number;
}

function relTime(iso: string): string {
  const t = Date.now() - new Date(iso).getTime();
  const m = Math.floor(t / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function dossierIcon(bucket: LeadRow["dossier"]["bucket"]): string {
  if (bucket === "ready") return "✅";
  if (bucket === "progress") return "⏳";
  return "○";
}

interface Props {
  workspaceId: string;
}

export function LeadsTable({ workspaceId: _workspaceId }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState<{ P: boolean; L: boolean; A: boolean }>({
    P: false,
    L: false,
    A: false,
  });
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [dossierFilter, setDossierFilter] = useState<"" | "none" | "progress" | "ready">("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/leads?funnel=1");
      if (!r.ok) return;
      const d = (await r.json()) as { stages: FunnelStage[]; stageCounts: Record<string, number> };
      setFunnelStages(d.stages ?? []);
      setStageCounts(d.stageCounts ?? {});
    })();
  }, []);

  const statusParams = useMemo(() => {
    const s: string[] = [];
    if (status.P) s.push("PROSPECT");
    if (status.L) s.push("LEAD");
    if (status.A) s.push("ACTIVE");
    return s;
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("limit", String(limit));
    if (debouncedSearch) sp.set("search", debouncedSearch);
    statusParams.forEach((s) => sp.append("status", s));
    if (cidade) sp.set("cidade", cidade);
    if (uf) sp.set("uf", uf);
    if (dossierFilter) sp.set("hasDossier", dossierFilter);
    if (createdFrom) sp.set("createdFrom", createdFrom);
    if (createdTo) sp.set("createdTo", createdTo);
    selectedStageIds.forEach((id) => sp.append("stageIds[]", id));
    const r = await fetch(`/api/leads?${sp.toString()}`);
    if (!r.ok) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { items: LeadRow[]; total: number };
    setItems(d.items);
    setTotal(d.total);
    setLoading(false);
  }, [
    page,
    limit,
    debouncedSearch,
    statusParams,
    cidade,
    uf,
    dossierFilter,
    createdFrom,
    createdTo,
    selectedStageIds,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) {
      for (const it of items) next[it.id] = true;
    }
    setSelected(next);
  };

  const exportCsv = async () => {
    const sp = new URLSearchParams();
    sp.set("page", "1");
    sp.set("limit", "5000");
    if (debouncedSearch) sp.set("search", debouncedSearch);
    statusParams.forEach((s) => sp.append("status", s));
    if (cidade) sp.set("cidade", cidade);
    if (uf) sp.set("uf", uf);
    if (dossierFilter) sp.set("hasDossier", dossierFilter);
    selectedStageIds.forEach((id) => sp.append("stageIds[]", id));
    sp.set("format", "csv");
    const r = await fetch(`/api/leads?${sp.toString()}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFunnelChipClick = (e: React.MouseEvent, stageId: string) => {
    e.preventDefault();
    if (e.shiftKey) {
      setSelectedStageIds((prev) =>
        prev.includes(stageId) ? prev.filter((x) => x !== stageId) : [...prev, stageId],
      );
    } else {
      setSelectedStageIds((prev) => (prev.length === 1 && prev[0] === stageId ? [] : [stageId]));
    }
    setPage(1);
  };

  const createCampaignWithSelection = () => {
    if (selectedIds.length === 0) return;
    sessionStorage.setItem("cockpit_campaign_contacts", JSON.stringify(selectedIds));
    router.push("/campanhas?prefill=1");
  };

  const applyBulkTag = async () => {
    const name = window.prompt("Nome da etiqueta?");
    if (!name?.trim()) return;
    const r = await fetch("/api/leads/tags/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: selectedIds, tagName: name.trim() }),
    });
    if (r.ok) void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Leads
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {total} contatos no filtro atual
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/leads/import"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: "var(--text-accent)" }}
          >
            + Importar CSV
          </Link>
          <Link
            href="/leads/new"
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
          >
            + Novo lead
          </Link>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            {filtersOpen ? "Ocultar filtros" : "Filtros"}
          </button>
        </div>
      </div>

      {funnelStages.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 rounded-lg border p-3"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
          role="toolbar"
          aria-label="Funil por etapa do pipeline"
        >
          {funnelStages.map((st) => {
            const active = selectedStageIds.includes(st.id);
            const count = stageCounts[st.id] ?? 0;
            return (
              <button
                key={st.id}
                type="button"
                onClick={(e) => onFunnelChipClick(e, st.id)}
                className="rounded-lg transition-all duration-150"
                style={{
                  padding: "4px 8px",
                  fontFamily: "var(--font-display)",
                  fontSize: "11px",
                  fontWeight: 500,
                  border: active ? "1px solid var(--text-accent)" : "1px solid var(--border-default)",
                  background: active ? "var(--surface-overlay)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}
                title="Clique para filtrar; Shift+clique para multi-seleção"
              >
                <span style={{ fontFamily: "var(--font-mono)", opacity: 0.75 }}>{st.position + 1}</span>{" "}
                {st.name}{" "}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    marginLeft: 4,
                    opacity: 0.85,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
        >
          <span style={{ color: "var(--text-secondary)" }}>{selectedIds.length} selecionados</span>
          <button
            type="button"
            className="rounded bg-[var(--text-accent)] px-2 py-1 text-xs text-white"
            onClick={createCampaignWithSelection}
          >
            Criar campanha
          </button>
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={applyBulkTag}>
            Aplicar etiqueta
          </button>
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={exportCsv}>
            Exportar CSV
          </button>
        </div>
      )}

      {filtersOpen && (
        <div
          className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
        >
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Busca</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
              placeholder="Nome ou telefone"
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>UF</span>
            <select
              value={uf}
              onChange={(e) => {
                setUf(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            >
              <option value="">—</option>
              {BR_UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Cidade (contém)</span>
            <input
              value={cidade}
              onChange={(e) => {
                setCidade(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Dossiê</span>
            <select
              value={dossierFilter}
              onChange={(e) => {
                setDossierFilter(e.target.value as typeof dossierFilter);
                setPage(1);
              }}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            >
              <option value="">Qualquer</option>
              <option value="none">Sem dossiê</option>
              <option value="progress">Em andamento</option>
              <option value="ready">Pronto</option>
            </select>
          </label>
          <div className="text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Status</span>
            <div className="mt-1 flex flex-wrap gap-3">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={status.P}
                  onChange={(e) => {
                    setStatus((s) => ({ ...s, P: e.target.checked }));
                    setPage(1);
                  }}
                />
                PROSPECT
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={status.L}
                  onChange={(e) => {
                    setStatus((s) => ({ ...s, L: e.target.checked }));
                    setPage(1);
                  }}
                />
                LEAD
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={status.A}
                  onChange={(e) => {
                    setStatus((s) => ({ ...s, A: e.target.checked }));
                    setPage(1);
                  }}
                />
                ACTIVE
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>
              <span style={{ color: "var(--text-secondary)" }}>Criado de</span>
              <input
                type="date"
                value={createdFrom}
                onChange={(e) => {
                  setCreatedFrom(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
              />
            </label>
            <label>
              <span style={{ color: "var(--text-secondary)" }}>Criado até</span>
              <input
                type="date"
                value={createdTo}
                onChange={(e) => {
                  setCreatedTo(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
              />
            </label>
          </div>
        </div>
      )}

      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
      >
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th className="p-2">
                <input
                  type="checkbox"
                  aria-label="Selecionar página"
                  onChange={(e) => toggleAll(e.target.checked)}
                  checked={items.length > 0 && items.every((it) => selected[it.id])}
                />
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Nome
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Tel.
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Imóvel
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Cidade/UF
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Etiquetas
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Status
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Etapa
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Dossiê
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Atividade
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="p-6 text-center" style={{ color: "var(--text-tertiary)" }}>
                  Carregando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center" style={{ color: "var(--text-tertiary)" }}>
                  Nenhum lead encontrado
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[it.id])}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [it.id]: e.target.checked }))
                      }
                      aria-label={`Selecionar ${it.name}`}
                    />
                  </td>
                  <td className="p-2">
                    <Link href={`/leads/${it.id}`} className="font-medium hover:underline" style={{ color: "var(--text-accent)" }}>
                      {it.name}
                    </Link>
                  </td>
                  <td className="p-2 font-mono text-xs">{it.phoneMasked}</td>
                  <td className="max-w-[200px] truncate p-2" title={it.imovel}>
                    {it.imovel}
                  </td>
                  <td className="p-2 text-xs">
                    {it.cidade} / {it.uf}
                  </td>
                  <td className="p-2">
                    <TagSelector contactId={it.id} initialTags={it.tags} onChange={() => void load()} />
                  </td>
                  <td className="p-2">
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: "var(--surface-overlay)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {it.leadLifecycle}
                    </span>
                  </td>
                  <td className="max-w-[140px] truncate p-2 text-xs" style={{ color: "var(--text-secondary)" }} title={it.pipelineStage?.name ?? ""}>
                    {it.pipelineStage ? (
                      <>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                          {it.pipelineStage.position + 1}
                        </span>{" "}
                        {it.pipelineStage.name}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-lg" title={it.dossier.status ?? ""}>
                    {dossierIcon(it.dossier.bucket)}
                    {it.dossier.score != null && (
                      <span className="ml-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {it.dossier.score.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {relTime(it.lastActivityAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="rounded border px-3 py-1 disabled:opacity-40"
          style={{ borderColor: "var(--border-default)" }}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Anterior
        </button>
        <span style={{ color: "var(--text-secondary)" }}>
          Página {page} · {total} total
        </span>
        <button
          type="button"
          className="rounded border px-3 py-1 disabled:opacity-40"
          style={{ borderColor: "var(--border-default)" }}
          disabled={page * limit >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
