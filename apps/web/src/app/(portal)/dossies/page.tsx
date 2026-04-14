"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BR_UFS } from "@/lib/br-ufs";

interface DossierRow {
  id: string;
  dealId: string;
  leadName: string;
  imovel: string;
  cidade: string;
  uf: string;
  score: number | null;
  status: string;
  reportUrl: string | null;
  sharedWithLead: boolean;
  contactId: string | null;
  stage: { name: string; position: number } | null;
  recommendation: "RECOMENDAR" | "CAUTELA" | "NAO_RECOMENDAR" | null;
}

const RECOMMENDATION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  RECOMENDAR: { bg: "#16a34a22", text: "#16a34a", label: "Recomendar" },
  CAUTELA: { bg: "#d9770622", text: "#d97706", label: "Cautela" },
  NAO_RECOMENDAR: { bg: "#dc262622", text: "#dc2626", label: "Nao recomendar" },
};

export default function DossiesPage() {
  const [items, setItems] = useState<DossierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [uf, setUf] = useState("");
  const [minScore, setMinScore] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (uf) sp.set("uf", uf);
    if (minScore) sp.set("minScore", minScore);
    const r = await fetch(`/api/dossiers?${sp.toString()}`);
    if (!r.ok) {
      setItems([]);
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { items: DossierRow[] };
    setItems(d.items);
    setLoading(false);
  }, [status, uf, minScore]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendWa = async (dossierId: string) => {
    const r = await fetch(`/api/dossier/${dossierId}/share`, { method: "POST" });
    if (!r.ok) window.alert("Falha ao enviar WA");
    else void load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Dossiês
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Relatórios de campo e PDFs.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
        >
          <option value="">Status (todos)</option>
          <option value="DRAFT">DRAFT</option>
          <option value="FIELD_PENDING">FIELD_PENDING</option>
          <option value="FIELD_COMPLETE">FIELD_COMPLETE</option>
          <option value="GENERATED">GENERATED</option>
          <option value="SHARED">SHARED</option>
        </select>
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
        <input
          type="number"
          placeholder="Score mín."
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          className="w-28 rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-base)" }}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Lead
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Imóvel
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Stage
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Cidade/UF
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Score
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Recomendação
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Status
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                PDF
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-4 text-center" style={{ color: "var(--text-tertiary)" }}>
                  Carregando…
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const rec = it.recommendation ? RECOMMENDATION_STYLES[it.recommendation] : null;
                return (
                  <tr key={it.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="p-2">
                      {it.contactId ? (
                        <Link href={`/leads/${it.contactId}`} style={{ color: "var(--text-accent)" }}>
                          {it.leadName}
                        </Link>
                      ) : (
                        it.leadName
                      )}
                    </td>
                    <td className="max-w-[200px] truncate p-2" title={it.imovel}>
                      {it.imovel}
                    </td>
                    <td className="p-2">
                      {it.stage ? (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: "var(--surface-overlay)", color: "var(--text-primary)" }}
                        >
                          S{it.stage.position} {it.stage.name}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {it.cidade} / {it.uf}
                    </td>
                    <td className="p-2">
                      {it.score != null ? (
                        <span>
                          {it.score.toFixed(1)}/10
                          {it.score >= 7 && <span className="text-amber-500"> ⚠</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">
                      {rec ? (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: rec.bg, color: rec.text }}
                        >
                          {rec.label}
                        </span>
                      ) : (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: "var(--surface-overlay)", color: "var(--text-tertiary)" }}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-xs">{it.status}</td>
                    <td className="p-2">{it.reportUrl ? "✅" : "—"}</td>
                    <td className="p-2 space-x-2 text-xs">
                      {it.reportUrl && (
                        <a
                          href={it.reportUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--text-accent)" }}
                        >
                          Ver
                        </a>
                      )}
                      {it.status === "GENERATED" && (
                        <button
                          type="button"
                          className="underline"
                          style={{ color: "var(--text-accent)" }}
                          onClick={() => void sendWa(it.id)}
                        >
                          Enviar WA
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
