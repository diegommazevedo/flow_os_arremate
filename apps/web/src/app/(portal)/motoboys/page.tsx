"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BR_UFS } from "@/lib/br-ufs";

interface AgentRow {
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

export default function MotoboysPage() {
  const [items, setItems] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [citiesStr, setCitiesStr] = useState("");
  const [statesSel, setStatesSel] = useState<string[]>([]);
  const [price, setPrice] = useState("80");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (cidade) sp.set("cidade", cidade);
    if (uf) sp.set("uf", uf);
    const r = await fetch(`/api/field-agents?${sp.toString()}`);
    if (!r.ok) {
      setItems([]);
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { items: AgentRow[] };
    setItems(d.items);
    setLoading(false);
  }, [cidade, uf]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const cities = citiesStr
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await fetch("/api/field-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          cities,
          states: statesSel,
          pricePerVisit: Number(price),
          notes,
        }),
      });
      if (!r.ok) {
        window.alert("Erro ao cadastrar");
        return;
      }
      setModal(false);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const toggleUf = (u: string) => {
    setStatesSel((s) => (s.includes(u) ? s.filter((x) => x !== u) : [...s, u]));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Motoboys
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Pool de field agents (vistoria).
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/settings/integrations"
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
          >
            Integrações
          </Link>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-white"
            style={{ background: "var(--text-accent)" }}
            onClick={() => setModal(true)}
          >
            + Cadastrar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Cidade"
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
        />
        <select
          value={uf}
          onChange={(e) => setUf(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
        >
          <option value="">UF</option>
          {BR_UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Nome
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Cidades
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                UF
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Preço
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Jobs
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Disp.
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-4 text-center" style={{ color: "var(--text-tertiary)" }}>
                  Carregando…
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2 text-xs">{a.cities.join(", ") || "—"}</td>
                  <td className="p-2 text-xs">{a.states.join(", ")}</td>
                  <td className="p-2">R$ {a.pricePerVisit.toFixed(0)}</td>
                  <td className="p-2">{a.totalJobs}</td>
                  <td className="p-2 text-xs">{a.availability}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        Importação em massa: use a rota existente{" "}
        <code className="rounded bg-[var(--surface-overlay)] px-1">POST /api/field-agents/import</code> (CSV).
      </p>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-md space-y-3 rounded-xl border p-5"
            style={{ background: "var(--surface-raised)", borderColor: "var(--border-default)" }}
          >
            <h2 className="font-semibold">Novo motoboy</h2>
            <input
              required
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
            <input
              required
              placeholder="Telefone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
            <input
              placeholder="Cidades (separadas por vírgula)"
              value={citiesStr}
              onChange={(e) => setCitiesStr(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
            <div className="flex flex-wrap gap-1 text-xs">
              {BR_UFS.map((u) => (
                <button
                  key={u}
                  type="button"
                  className="rounded border px-1.5 py-0.5"
                  style={{
                    borderColor: statesSel.includes(u) ? "var(--text-accent)" : "var(--border-default)",
                    background: statesSel.includes(u) ? "var(--surface-active)" : "transparent",
                  }}
                  onClick={() => toggleUf(u)}
                >
                  {u}
                </button>
              ))}
            </div>
            <input
              required
              type="number"
              min={1}
              placeholder="Valor visita"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
            <textarea
              placeholder="Observações"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || statesSel.length === 0}
                className="rounded-lg bg-[var(--text-accent)] px-3 py-1.5 text-sm text-white"
              >
                Salvar
              </button>
              <button type="button" className="text-sm" onClick={() => setModal(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
