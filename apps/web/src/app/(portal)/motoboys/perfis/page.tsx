"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface MissionProfileRow {
  id: string;
  name: string;
  description: string | null;
  level: string;
  isDefault: boolean;
  isActive: boolean;
  bandeiradaValue: number;
  maxValue: number;
}

export default function MissionProfilesListPage() {
  const [items, setItems] = useState<MissionProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const r = await fetch("/api/mission-profiles");
    if (!r.ok) {
      setErr("Não foi possível carregar perfis.");
      setItems([]);
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { profiles: MissionProfileRow[] };
    setItems(d.profiles ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async (id: string) => {
    const r = await fetch(`/api/mission-profiles/${id}/activate`, { method: "POST" });
    if (!r.ok) {
      window.alert("Falha ao definir padrão");
      return;
    }
    void load();
  };

  const clone = async (id: string, name: string) => {
    const r = await fetch(`/api/mission-profiles/${id}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) {
      window.alert("Falha ao clonar");
      return;
    }
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Perfis de missão
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Valores, itens de vistoria e regras de skip por território — P-02 em JSON.
          </p>
        </div>
        <Link
          href="/motoboys/perfis/novo"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: "var(--text-accent)" }}
        >
          + Novo perfil
        </Link>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Carregando…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: "var(--surface-overlay)", color: "var(--text-secondary)" }}
                  >
                    {p.level}
                  </span>
                  <h2 className="mt-2 font-medium" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                    {p.isDefault ? (
                      <span className="ml-2 text-amber-500" aria-label="Perfil padrão">
                        ★
                      </span>
                    ) : null}
                  </h2>
                  {p.description ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {p.description}
                    </p>
                  ) : null}
                </div>
                {!p.isActive ? (
                  <span className="text-xs text-red-500">Inativo</span>
                ) : null}
              </div>
              <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                Bandeirada: R$ {(p.bandeiradaValue / 100).toFixed(2)} — Teto: R$ {(p.maxValue / 100).toFixed(2)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/motoboys/perfis/${p.id}`}
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  Editar
                </Link>
                {!p.isDefault ? (
                  <button
                    type="button"
                    className="rounded-lg border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--border-default)" }}
                    onClick={() => void activate(p.id)}
                  >
                    Ativar como padrão
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--border-default)" }}
                  onClick={() => {
                    const n = window.prompt("Nome da cópia?", `${p.name} (cópia)`);
                    if (n?.trim()) void clone(p.id, n.trim());
                  }}
                >
                  Clonar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
