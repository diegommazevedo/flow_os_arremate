"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MissionItemConfig } from "@flow-os/brain/workers/mission-profile-default-items";

interface ProfileDetail {
  id: string;
  name: string;
  description: string | null;
  level: "DOWN" | "STANDARD" | "UP";
  isDefault: boolean;
  isActive: boolean;
  bandeiradaValue: number;
  maxValue: number;
  currency: string;
  items: unknown;
  skipPenalty: boolean;
  skipRequiresText: boolean;
  skipMinChars: number;
  skipMaxItems: number;
  skipReasons: string[];
  agentLimit: number;
  followupDelayMs: number;
  deadlineHours: number;
  autoSelectRules: unknown;
}

export default function MissionProfileEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<ProfileDetail | null>(null);
  const [items, setItems] = useState<MissionItemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const r = await fetch(`/api/mission-profiles/${id}`);
    if (!r.ok) {
      setErr("Perfil não encontrado");
      setP(null);
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { profile: ProfileDetail };
    setP(d.profile);
    const raw = d.profile.items;
    const arr = Array.isArray(raw) ? (raw as MissionItemConfig[]) : [];
    setItems(arr.length ? arr : []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!p) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/mission-profiles/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...p,
          items,
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErr(d.error ?? "Erro ao salvar");
        return;
      }
      void load();
    } finally {
      setBusy(false);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    setItems((prev) => {
      const n = [...prev];
      const t = n[idx]!;
      n[idx] = n[j]!;
      n[j] = t;
      return n.map((it, i) => ({ ...it, order: i }));
    });
  };

  const remove = async () => {
    if (!p || p.isDefault) return;
    if (!window.confirm("Excluir este perfil?")) return;
    const r = await fetch(`/api/mission-profiles/${p.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = (await r.json()) as { error?: string };
      window.alert(d.error ?? "Erro");
      return;
    }
    router.push("/motoboys/perfis");
  };

  if (loading) return <p style={{ color: "var(--text-tertiary)" }}>Carregando…</p>;
  if (!p) return <p className="text-red-600">{err ?? "—"}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/motoboys/perfis" className="text-sm" style={{ color: "var(--text-accent)" }}>
        ← Perfis
      </Link>
      <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Editar: {p.name}
      </h1>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border-default)" }}>
        <label className="block text-sm">
          Nome
          <input
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          Descrição
          <textarea
            value={p.description ?? ""}
            onChange={(e) => setP({ ...p, description: e.target.value || null })}
            rows={2}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          />
        </label>
        <label className="block text-sm">
          Nível
          <select
            value={p.level}
            onChange={(e) => setP({ ...p, level: e.target.value as ProfileDetail["level"] })}
            className="mt-1 w-full rounded border px-2 py-1"
            style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
          >
            <option value="DOWN">DOWN</option>
            <option value="STANDARD">STANDARD</option>
            <option value="UP">UP</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            Bandeirada (centavos)
            <input
              type="number"
              value={p.bandeiradaValue}
              onChange={(e) => setP({ ...p, bandeiradaValue: Number(e.target.value) || 0 })}
              className="mt-1 w-full rounded border px-2 py-1"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
          </label>
          <label className="block text-sm">
            Teto (centavos)
            <input
              type="number"
              value={p.maxValue}
              onChange={(e) => setP({ ...p, maxValue: Number(e.target.value) || 0 })}
              className="mt-1 w-full rounded border px-2 py-1"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
          </label>
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Preview: motoboy entre R$ {(p.bandeiradaValue / 100).toFixed(2)} e R$ {(p.maxValue / 100).toFixed(2)}
        </p>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border-default)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Itens (reordenar)
        </h2>
        <ul className="mt-2 space-y-2">
          {items.map((it, idx) => (
            <li
              key={it.id}
              className="flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span className="font-mono text-xs w-6">{idx + 1}</span>
              <button type="button" className="text-xs" onClick={() => move(idx, -1)} aria-label="Subir">
                ↑
              </button>
              <button type="button" className="text-xs" onClick={() => move(idx, 1)} aria-label="Descer">
                ↓
              </button>
              <input
                value={it.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, label: v } : x)));
                }}
                className="min-w-[120px] flex-1 rounded border px-1 py-0.5"
                style={{ borderColor: "var(--border-default)" }}
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={it.required}
                  onChange={(e) => {
                    const c = e.target.checked;
                    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, required: c } : x)));
                  }}
                />
                obrig.
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={it.enabled}
                  onChange={(e) => {
                    const c = e.target.checked;
                    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: c } : x)));
                  }}
                />
                ativo
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg px-3 py-1.5 text-sm text-white"
          style={{ background: "var(--text-accent)" }}
        >
          Salvar perfil
        </button>
        {!p.isDefault ? (
          <button type="button" onClick={() => void remove()} className="rounded-lg border px-3 py-1.5 text-sm text-red-600">
            Excluir
          </button>
        ) : null}
      </div>
    </div>
  );
}
