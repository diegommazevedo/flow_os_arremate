"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BR_UFS } from "@/lib/br-ufs";

export default function NewLeadPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await fetch("/api/leads/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, endereco, cidade, uf }),
      });
      const d = (await r.json().catch(() => ({}))) as { contactId?: string; error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Erro");
        return;
      }
      router.push(`/leads/${d.contactId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Novo lead
        </h1>
        <Link href="/leads" className="text-sm" style={{ color: "var(--text-accent)" }}>
          Voltar
        </Link>
      </div>
      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)" }}>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <label className="block text-sm">
          Nome *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          Telefone *
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          Endereço imóvel
          <input
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          Cidade
          <input
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          UF
          <select
            value={uf}
            onChange={(e) => setUf(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
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
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg py-2 text-sm font-medium text-white"
          style={{ background: "var(--text-accent)" }}
        >
          {loading ? "Salvando…" : "Criar lead"}
        </button>
      </form>
    </div>
  );
}
