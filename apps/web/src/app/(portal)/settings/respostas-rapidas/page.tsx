"use client";

/**
 * /settings/respostas-rapidas — CRUD de Respostas Rápidas
 */

import { useState, useEffect } from "react";
import type { Metadata } from "next";

interface Resposta { id: string; atalho: string; texto: string; createdAt: string }

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-800" />)}
    </div>
  );
}

// ─── Form inline ──────────────────────────────────────────────────────────────

function RespostaForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Resposta>;
  onSave:  (data: { atalho: string; texto: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [atalho, setAtalho] = useState(initial?.atalho ?? "");
  const [texto,  setTexto]  = useState(initial?.texto  ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!atalho.trim() || !texto.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ atalho: atalho.trim(), texto: texto.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} className="card space-y-3">
      <div>
        <label className="label block mb-1">Atalho (sem /)</label>
        <input
          value={atalho}
          onChange={e => setAtalho(e.target.value.replace(/\s+/g, "").toLowerCase())}
          placeholder="ex: /saudacao, /documentos, /prazo"
          className="input w-full"
          required
          maxLength={80}
        />
      </div>
      <div>
        <label className="label block mb-1">Texto da resposta</label>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={4}
          placeholder="Use {PRIMEIRO_NOME_LEAD} e {DAY_GREETING} como variáveis"
          className="input w-full resize-none"
          required
          maxLength={4000}
        />
        <p className="text-[10px] text-gray-600 mt-1">
          Variáveis: <code className="text-gray-400">{"{PRIMEIRO_NOME_LEAD}"}</code> · <code className="text-gray-400">{"{DAY_GREETING}"}</code>
        </p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2 text-sm">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RespostasRapidasPage() {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [search,    setSearch]    = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/respostas-rapidas")
      .then(r => r.ok ? r.json() : { respostas: [] })
      .then((d: { respostas?: Resposta[] }) => setRespostas(d.respostas ?? []))
      .catch(() => setRespostas([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (data: { atalho: string; texto: string }) => {
    const r = await fetch("/api/respostas-rapidas", {
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

  const remove = async (id: string) => {
    if (!confirm("Remover esta resposta rápida?")) return;
    await fetch(`/api/respostas-rapidas/${id}`, { method: "DELETE" });
    setRespostas(prev => prev.filter(r => r.id !== id));
  };

  const filtered = respostas.filter(r =>
    !search ||
    r.atalho.toLowerCase().includes(search.toLowerCase()) ||
    r.texto.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Respostas Rápidas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Digite <code className="bg-gray-800 px-1 rounded text-xs text-gray-300">/atalho</code> no chat para inserir automaticamente
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setEditId(null); }}
          className="btn-primary px-4 py-2 text-sm"
        >
          + Nova Resposta
        </button>
      </div>

      {creating && (
        <RespostaForm
          onSave={create}
          onCancel={() => setCreating(false)}
        />
      )}

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por atalho ou texto…"
        className="input w-full"
      />

      {loading ? <Skeleton /> : filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-600">
          <p className="text-3xl mb-2">⚡</p>
          <p className="text-sm">{search ? "Nenhuma resposta encontrada" : "Nenhuma resposta cadastrada ainda"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="card flex gap-3 items-start">
              {editId === r.id ? (
                <div className="flex-1">
                  <RespostaForm
                    initial={r}
                    onSave={async (data) => {
                      const res = await fetch(`/api/respostas-rapidas`, {
                        method:  "POST",
                        headers: { "Content-Type": "application/json" },
                        body:    JSON.stringify(data),
                      });
                      if (!res.ok) throw new Error("Erro ao salvar");
                      load();
                      setEditId(null);
                    }}
                    onCancel={() => setEditId(null)}
                  />
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-xs font-bold text-indigo-400">/{r.atalho}</code>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{r.texto}</p>
                    <p className="text-[10px] text-gray-600 mt-1">
                      {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditId(r.id)}
                      className="btn-secondary px-2 py-1 text-xs"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void remove(r.id)}
                      className="px-2 py-1 rounded-lg text-xs text-red-400 border border-red-900/50 hover:bg-red-900/20 transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
