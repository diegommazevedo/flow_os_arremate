"use client";

/**
 * /settings/departamentos — CRUD de Departamentos + membros
 */

import { useState, useEffect } from "react";

interface Departamento { id: string; nome: string; membros: string[]; createdAt: string }

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-800" />)}
    </div>
  );
}

function DeptForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Departamento>;
  onSave:   (data: { nome: string; membros: string[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const [nome,    setNome]    = useState(initial?.nome    ?? "");
  const [membros, setMembros] = useState<string>((initial?.membros ?? []).join(", "));
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const parsedMembros = membros
        .split(",")
        .map(m => m.trim())
        .filter(Boolean);
      await onSave({ nome: nome.trim(), membros: parsedMembros });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} className="card space-y-3">
      <div>
        <label className="label block mb-1">Nome do departamento</label>
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="ex: ATD_SUL, Pré-arrematação"
          className="input w-full"
          required maxLength={160}
        />
      </div>
      <div>
        <label className="label block mb-1">Membros (IDs separados por vírgula)</label>
        <input
          value={membros}
          onChange={e => setMembros(e.target.value)}
          placeholder="userId1, userId2"
          className="input w-full"
        />
        <p className="text-[10px] text-gray-600 mt-1">IDs dos usuários responsáveis por este departamento</p>
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

export default function DepartamentosPage() {
  const [depts,    setDepts]    = useState<Departamento[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/departamentos")
      .then(r => r.ok ? r.json() : { departamentos: [] })
      .then((d: { departamentos?: Departamento[] }) => setDepts(d.departamentos ?? []))
      .catch(() => setDepts([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (data: { nome: string; membros: string[] }) => {
    const r = await fetch("/api/departamentos", {
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
    if (!confirm("Remover este departamento?")) return;
    await fetch(`/api/departamentos/${id}`, { method: "DELETE" });
    setDepts(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Departamentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Grupos de atendimento para roteamento de conversas</p>
        </div>
        <button onClick={() => { setCreating(true); setEditId(null); }} className="btn-primary px-4 py-2 text-sm">
          + Novo Departamento
        </button>
      </div>

      {creating && (
        <DeptForm
          onSave={create}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading ? <Skeleton /> : depts.length === 0 ? (
        <div className="card text-center py-12 text-gray-600">
          <p className="text-3xl mb-2">🏢</p>
          <p className="text-sm">Nenhum departamento cadastrado ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {depts.map(dept => (
            <div key={dept.id} className="card">
              {editId === dept.id ? (
                <DeptForm
                  initial={dept}
                  onSave={async (data) => {
                    const r = await fetch(`/api/departamentos/${dept.id}`, {
                      method:  "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body:    JSON.stringify(data),
                    });
                    if (!r.ok) throw new Error("Erro ao atualizar");
                    load();
                    setEditId(null);
                  }}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🏢</span>
                      <h3 className="text-sm font-semibold text-white">{dept.nome}</h3>
                    </div>
                    {dept.membros.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {dept.membros.map(m => (
                          <span key={m} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-mono">
                            {m.slice(0, 12)}…
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">Sem membros atribuídos</p>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">
                      Criado em {new Date(dept.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setEditId(dept.id)} className="btn-secondary px-2 py-1 text-xs">
                      Editar
                    </button>
                    <button
                      onClick={() => void remove(dept.id)}
                      className="px-2 py-1 rounded-lg text-xs text-red-400 border border-red-900/50 hover:bg-red-900/20 transition-colors"
                    >
                      Remover
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
