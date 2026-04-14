"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { DEFAULT_MISSION_ITEMS } from "@flow-os/brain/workers/mission-profile-default-items";

export default function NovoMissionProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [level, setLevel] = useState<"DOWN" | "STANDARD" | "UP">("STANDARD");
  const [band, setBand] = useState("40");
  const [max, setMax] = useState("80");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr("Nome obrigatório");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/mission-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          level,
          bandeiradaValue: Math.round(Number(band.replace(",", ".")) * 100) || 4000,
          maxValue: Math.round(Number(max.replace(",", ".")) * 100) || 8000,
          items: DEFAULT_MISSION_ITEMS,
        }),
      });
      const d = (await r.json()) as { profile?: { id: string }; error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Erro ao criar");
        return;
      }
      if (d.profile?.id) router.push(`/motoboys/perfis/${d.profile.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/motoboys/perfis" className="text-sm" style={{ color: "var(--text-accent)" }}>
        ← Voltar
      </Link>
      <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Novo perfil
      </h1>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border-default)" }}>
        <label className="block text-sm">
          Nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          Nível
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as "DOWN" | "STANDARD" | "UP")}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          >
            <option value="DOWN">Baixo (DOWN)</option>
            <option value="STANDARD">Padrão</option>
            <option value="UP">Alto (UP)</option>
          </select>
        </label>
        <label className="block text-sm">
          Bandeirada (R$)
          <input
            value={band}
            onChange={(e) => setBand(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          Teto máximo (R$)
          <input
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-sm text-white"
          style={{ background: "var(--text-accent)" }}
        >
          Criar
        </button>
      </form>
    </div>
  );
}
