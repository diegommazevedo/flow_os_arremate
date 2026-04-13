"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  name: string;
  slug: string;
  sector: string;
  createdAt: string;
  _count: { members: number };
};

export function AdminWorkspacesClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState<"caixa" | "generic">("caixa");
  const [adminEmail, setAdminEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/workspaces", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { workspaces: Row[] };
    setRows(data.workspaces);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, template, adminEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ownerWarning?: string;
        ownerLinked?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Erro ao criar workspace");
        return;
      }
      if (data.ownerWarning) setNotice(data.ownerWarning);
      else if (data.ownerLinked) setNotice("Owner associado com sucesso.");
      setOpen(false);
      setName("");
      setSlug("");
      setAdminEmail("");
      setTemplate("caixa");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", color: "var(--text-primary)" }}>
            Workspaces
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: 4 }}>
            Gestão global de tenants (apenas SUPER_ADMIN).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg transition-colors"
          style={{
            padding: "8px 14px",
            fontFamily: "var(--font-display)",
            fontSize: "13px",
            fontWeight: 500,
            background: "var(--text-accent)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          + Novo workspace
        </button>
      </div>

      {notice ? (
        <div
          className="mb-4 rounded-lg px-3 py-2"
          style={{ background: "var(--surface-overlay)", fontSize: "12px", color: "var(--text-secondary)" }}
        >
          {notice}
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-lg"
        style={{ border: "1px solid var(--border-subtle)", background: "var(--surface-raised)" }}
      >
        <table className="w-full text-left" style={{ fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Slug</th>
              <th className="px-4 py-2 font-medium">Setor</th>
              <th className="px-4 py-2 font-medium">Membros</th>
              <th className="px-4 py-2 font-medium">Criado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                <td className="px-4 py-2">{w.name}</td>
                <td className="px-4 py-2" style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                  {w.slug}
                </td>
                <td className="px-4 py-2">{w.sector}</td>
                <td className="px-4 py-2">{w._count.members}</td>
                <td className="px-4 py-2" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                  {new Date(w.createdAt).toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center" style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>
            Nenhum workspace.
          </div>
        ) : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ws-modal-title"
        >
          <div
            className="w-full max-w-md rounded-xl p-5"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)" }}
          >
            <h2 id="ws-modal-title" style={{ fontFamily: "var(--font-display)", fontSize: "18px", marginBottom: 16 }}>
              Novo workspace
            </h2>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Nome
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-md px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", background: "var(--surface-base)", color: "var(--text-primary)" }}
                />
              </label>
              <label className="flex flex-col gap-1" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Slug (URL)
                <input
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="rounded-md px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", background: "var(--surface-base)", color: "var(--text-primary)" }}
                />
              </label>
              <label className="flex flex-col gap-1" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Template
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as "caixa" | "generic")}
                  className="rounded-md px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", background: "var(--surface-base)", color: "var(--text-primary)" }}
                >
                  <option value="caixa">Arrematador Caixa</option>
                  <option value="generic">Genérico</option>
                </select>
              </label>
              <label className="flex flex-col gap-1" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Email admin (Supabase)
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="opcional"
                  className="rounded-md px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", background: "var(--surface-base)", color: "var(--text-primary)" }}
                />
              </label>
              {error ? (
                <div style={{ fontSize: "12px", color: "var(--color-q1)" }}>{error}</div>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", background: "transparent", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg px-3 py-2"
                  style={{
                    border: "none",
                    background: "var(--text-accent)",
                    color: "#fff",
                    cursor: loading ? "wait" : "pointer",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
