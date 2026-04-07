"use client";

/**
 * /settings/tags — CRUD de Tags do chat com color picker
 */

import { useState, useEffect } from "react";

interface Tag {
  id:        string;
  descricao: string;
  corFundo:  string;
  corTexto:  string;
  ordem:     number;
  createdAt: string;
}

const PRESET_COLORS = [
  { fundo: "#ef4444", texto: "#ffffff" },
  { fundo: "#f97316", texto: "#ffffff" },
  { fundo: "#f59e0b", texto: "#000000" },
  { fundo: "#22c55e", texto: "#ffffff" },
  { fundo: "#3b82f6", texto: "#ffffff" },
  { fundo: "#8b5cf6", texto: "#ffffff" },
  { fundo: "#ec4899", texto: "#ffffff" },
  { fundo: "#6b7280", texto: "#ffffff" },
  { fundo: "#0f172a", texto: "#94a3b8" },
  { fundo: "#14b8a6", texto: "#ffffff" },
];

const PANEL =
  "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";
const PANEL_EMPTY =
  "rounded-xl border border-gray-800 bg-gray-900/70 shadow-sm px-4 py-12 text-center text-gray-600";

function TagPill({ descricao, corFundo, corTexto }: { descricao: string; corFundo: string; corTexto: string }) {
  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-sm font-medium"
      style={{ backgroundColor: corFundo, color: corTexto }}
    >
      {descricao}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 animate-pulse">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl bg-gray-800" />)}
    </div>
  );
}

function TagForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Tag>;
  onSave:   (data: Omit<Tag, "id" | "ordem" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [corFundo,  setCorFundo]  = useState(initial?.corFundo  ?? "#6366f1");
  const [corTexto,  setCorTexto]  = useState(initial?.corTexto  ?? "#ffffff");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ descricao: descricao.trim(), corFundo, corTexto });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} className="card space-y-4">
      <div>
        <label className="label block mb-1">Nome da tag</label>
        <input
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="ex: CONDOMÍNIO, URGENTE"
          className="input w-full"
          required maxLength={120}
        />
      </div>

      {/* Color picker */}
      <div>
        <label className="label block mb-2">Cor</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESET_COLORS.map(c => (
            <button
              key={c.fundo}
              type="button"
              onClick={() => { setCorFundo(c.fundo); setCorTexto(c.texto); }}
              className={`w-8 h-8 rounded-full border-2 transition-all ${corFundo === c.fundo ? "border-white scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c.fundo }}
            />
          ))}
        </div>
        <div className="flex gap-3 items-center">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Fundo</label>
            <input
              type="color"
              value={corFundo}
              onChange={e => setCorFundo(e.target.value)}
              className="w-10 h-8 rounded cursor-pointer bg-transparent border-0"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Texto</label>
            <input
              type="color"
              value={corTexto}
              onChange={e => setCorTexto(e.target.value)}
              className="w-10 h-8 rounded cursor-pointer bg-transparent border-0"
            />
          </div>
          <div className="ml-2">
            <label className="text-[10px] text-gray-500 block mb-1">Pré-visualização</label>
            <TagPill descricao={descricao || "Tag"} corFundo={corFundo} corTexto={corTexto} />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

export default function TagsPage() {
  const [tags,    setTags]    = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editId,  setEditId]  = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/tags")
      .then(r => r.ok ? r.json() : { tags: [] })
      .then((d: { tags?: Tag[] }) => setTags(d.tags ?? []))
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (data: Omit<Tag, "id" | "ordem" | "createdAt">) => {
    const r = await fetch("/api/tags", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    if (!r.ok) {
      const d = await r.json() as { error?: string };
      throw new Error(d.error ?? "Erro ao criar");
    }
    load();
    setCreating(false);
  };

  const update = async (id: string, data: Partial<Pick<Tag, "descricao" | "corFundo" | "corTexto">>) => {
    const r = await fetch(`/api/tags/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    if (!r.ok) {
      const d = await r.json() as { error?: string };
      throw new Error(d.error ?? "Erro ao atualizar");
    }
    load();
    setEditId(null);
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta tag? As conversas que a usam não serão afetadas.")) return;
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
    setTags(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Tags</h1>
          <p className="text-sm text-gray-500 mt-0.5">Categorize conversas com marcadores coloridos</p>
        </div>
        <button onClick={() => { setCreating(true); setEditId(null); }} className="btn-primary px-4 py-2 text-sm">
          + Nova Tag
        </button>
      </div>

      {creating && (
        <TagForm
          onSave={create}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading ? <Skeleton /> : tags.length === 0 ? (
        <div className={PANEL_EMPTY}>
          <p className="text-3xl mb-2">🏷️</p>
          <p className="text-sm">Nenhuma tag cadastrada ainda</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {tags.map(tag => (
            <div key={tag.id} className={PANEL}>
              {editId === tag.id ? (
                <TagForm
                  initial={tag}
                  onSave={data => update(tag.id, data)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <TagPill descricao={tag.descricao} corFundo={tag.corFundo} corTexto={tag.corTexto} />
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditId(tag.id)} className="btn-secondary px-2 py-0.5 text-xs">
                      Editar
                    </button>
                    <button
                      onClick={() => void remove(tag.id)}
                      className="px-2 py-0.5 rounded text-xs text-red-400 border border-red-900/50 hover:bg-red-900/20 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
