"use client";

import { useState, useEffect, useCallback } from "react";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

interface Agent {
  id: string;
  name: string;
  phone: string | null;
  cities: string[];
  states: string[];
  pricePerVisit: number;
  avgRating: number | null;
  totalJobs: number;
  availability: string;
}

export function PoolTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cidade) params.set("cidade", cidade);
    if (uf) params.set("uf", uf);
    const res = await fetch(`/api/field-agents?${params}`);
    const data = await res.json();
    setAgents(data.items ?? []);
    setLoading(false);
  }, [cidade, uf]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Filtrar cidade..."
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
        />
        <select
          value={uf}
          onChange={(e) => setUf(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
        >
          <option value="">Todos UFs</option>
          {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <button
          onClick={() => setShowModal(true)}
          className="ml-auto rounded-md px-4 py-1.5 text-sm font-medium text-white"
          style={{ background: "var(--text-accent)" }}
        >
          + Novo Motoboy
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-raised)" }}>
              {["Nome","Cidades","UF","Preço","Jobs","Rating","Disp."].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>Carregando...</td></tr>
            ) : agents.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>Nenhum motoboy encontrado</td></tr>
            ) : agents.map((a) => (
              <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{a.name}</td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>{a.cities.join(", ") || "—"}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>{a.states.join(", ")}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>R$ {a.pricePerVisit.toFixed(2)}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>{a.totalJobs}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>{a.avgRating?.toFixed(1) ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{
                    color: a.availability === "AVAILABLE" ? "var(--color-success)" : "var(--text-tertiary)",
                    background: a.availability === "AVAILABLE" ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                  }}>
                    {a.availability === "AVAILABLE" ? "Disponível" : a.availability === "BUSY" ? "Ocupado" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && <CreateModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cities, setCities] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [price, setPrice] = useState("80");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    const res = await fetch("/api/field-agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        cities: cities.split(",").map((c) => c.trim()).filter(Boolean),
        states,
        pricePerVisit: Number(price),
        notes: notes || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Erro ao criar");
      setSaving(false);
      return;
    }
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl p-6 shadow-xl" style={{ background: "var(--surface-overlay)" }}>
        <h3 className="mb-4 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Novo Motoboy</h3>
        <div className="space-y-3">
          <input placeholder="Nome *" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
          <input placeholder="Telefone *" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
          <input placeholder="Cidades (separar por vírgula)" value={cities} onChange={(e) => setCities(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>UFs de atuação *</label>
            <div className="flex flex-wrap gap-1">
              {["SP","RJ","MG","BA","PR","RS","SC","GO","DF","PE","CE","PA","MA","MT","MS","ES","PB","RN","AL","SE","PI","RO","TO","AC","AP","AM","RR"].map((u) => (
                <button key={u} type="button"
                  onClick={() => setStates((prev) => prev.includes(u) ? prev.filter((s) => s !== u) : [...prev, u])}
                  className="rounded px-2 py-0.5 text-xs font-medium transition-colors"
                  style={{
                    background: states.includes(u) ? "var(--text-accent)" : "var(--surface-hover)",
                    color: states.includes(u) ? "#fff" : "var(--text-secondary)",
                  }}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <input placeholder="Preço por visita *" type="number" value={price} onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
          <textarea placeholder="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: "var(--color-q1)" }}>{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-4 py-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>Cancelar</button>
          <button onClick={submit} disabled={saving || !name || !phone || states.length === 0}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--text-accent)" }}>
            {saving ? "Salvando..." : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
