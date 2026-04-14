"use client";

/**
 * Seletor de etiquetas para um contato.
 * [SEC-03] contactId escopo do workspace autenticado (API valida).
 */

import { useCallback, useEffect, useState } from "react";

export interface TagLite {
  id: string;
  name: string;
  color: string;
}

const PRESET_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

interface Props {
  contactId: string;
  initialTags: TagLite[];
  onChange?: () => void;
}

export function TagSelector({ contactId, initialTags, onChange }: Props) {
  const [tags, setTags] = useState<TagLite[]>(initialTags);
  const [allTags, setAllTags] = useState<TagLite[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]!);
  const [busy, setBusy] = useState(false);

  const reloadAll = useCallback(async () => {
    const r = await fetch("/api/tags");
    if (!r.ok) return;
    const d = (await r.json()) as { tags: TagLite[] };
    setAllTags(d.tags ?? []);
  }, []);

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  useEffect(() => {
    if (open) void reloadAll();
  }, [open, reloadAll]);

  const patchTag = async (tagId: string, action: "add" | "remove", tagObj?: TagLite) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/contacts/${contactId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId, action }),
      });
      if (!r.ok) return;
      if (action === "add") {
        const t = tagObj ?? allTags.find((x) => x.id === tagId);
        if (t) setTags((prev) => [...prev.filter((p) => p.id !== t.id), t]);
      } else {
        setTags((prev) => prev.filter((p) => p.id !== tagId));
      }
      onChange?.();
    } finally {
      setBusy(false);
    }
  };

  const createTag = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!r.ok) return;
      const t = (await r.json()) as TagLite;
      setAllTags((prev) => [...prev.filter((p) => p.id !== t.id), t]);
      await patchTag(t.id, "add", t);
      setNewName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}44` }}
        >
          {t.name}
          <button
            type="button"
            className="opacity-60 hover:opacity-100"
            aria-label={`Remover etiqueta ${t.name}`}
            disabled={busy}
            onClick={() => void patchTag(t.id, "remove")}
          >
            ×
          </button>
        </span>
      ))}
      <div className="relative">
        <button
          type="button"
          className="rounded border border-dashed px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
          aria-label="Adicionar etiqueta"
          disabled={busy}
          onClick={() => setOpen((o) => !o)}
        >
          + etiqueta
        </button>
        {open && (
          <div
            className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border p-2 shadow-lg"
            style={{
              background: "var(--surface-raised)",
              borderColor: "var(--border-default)",
            }}
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
              Existentes
            </p>
            <div className="max-h-28 overflow-y-auto">
              {allTags
                .filter((t) => !tags.some((x) => x.id === t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="mb-1 block w-full truncate rounded px-1 text-left text-xs hover:bg-[var(--surface-hover)]"
                    onClick={() => void patchTag(t.id, "add")}
                  >
                    {t.name}
                  </button>
                ))}
            </div>
            <hr className="my-2 border-[var(--border-subtle)]" />
            <p className="mb-1 text-[10px] uppercase text-[var(--text-tertiary)]">Nova</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              className="mb-1 w-full rounded border px-1 py-0.5 text-xs"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
            />
            <div className="mb-1 flex gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  className="h-4 w-4 rounded-full border"
                  style={{
                    background: c,
                    borderColor: newColor === c ? "var(--text-primary)" : "transparent",
                  }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <button
              type="button"
              className="w-full rounded bg-[var(--text-accent)] py-1 text-xs text-white"
              disabled={busy}
              onClick={() => void createTag()}
            >
              Criar e aplicar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
