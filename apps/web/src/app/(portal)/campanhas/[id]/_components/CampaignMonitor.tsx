"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Snapshot {
  campaign?: {
    id: string;
    name: string;
    status: string;
    totalLeads: number;
    sentCount: number;
    doneCount: number;
  };
  metrics?: {
    motoboyContacted: number;
    motoboyAccepted: number;
    evidences: number;
    dossierGenerated: number;
    dossierShared: number;
  };
  items?: Array<{
    id: string;
    contactName: string;
    imovel: string;
    motoboyName: string | null;
    itemStatus: string;
    uiStatus: string;
    dossierStatus: string | null;
    evidenceCount: number;
    score: number | null;
    reportUrl: string | null;
    error: string | null;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  aguardando_motoboy: "⏳ Aguardando motoboy",
  processando: "⚙️ Processando",
  motoboy_acionado: "📱 Motoboy acionado",
  motoboy_aceitou: "✅ Motoboy aceitou",
  coletando_evidencias: "📸 Coletando evidências",
  pdf_pronto: "📄 PDF pronto",
  enviado_lead: "✉️ Enviado ao lead",
  erro: "❌ Erro",
  concluido: "✔️ Concluído",
  desconhecido: "…",
};

export function CampaignMonitor({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [useSse, setUseSse] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch(`/api/campaigns/${campaignId}`);
    if (!r.ok) return;
    setData((await r.json()) as Snapshot);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!useSse) {
      const iv = setInterval(() => void load(), 10_000);
      return () => clearInterval(iv);
    }
    const es = new EventSource(`/api/campaigns/${campaignId}/stream`);
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data as string) as Snapshot);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      setUseSse(false);
    };
    return () => es.close();
  }, [campaignId, load, useSse]);

  const c = data?.campaign;
  const m = data?.metrics;
  const items = data?.items ?? [];
  const pct =
    c && c.totalLeads > 0 ? Math.round((c.doneCount / c.totalLeads) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {c?.name ?? "Campanha"}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {c?.totalLeads ?? 0} leads · status {c?.status ?? "—"} · enviados {c?.sentCount ?? 0} ·
            concluídos {c?.doneCount ?? 0}
          </p>
        </div>
        <Link href="/campanhas" className="text-sm" style={{ color: "var(--text-accent)" }}>
          ← Lista
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Motoboys acion.", m?.motoboyContacted ?? 0],
          ["Motoboys aceit.", m?.motoboyAccepted ?? 0],
          ["Evidências", m?.evidences ?? 0],
          ["Dossiês prontos", m?.dossierGenerated ?? 0],
        ].map(([label, val]) => (
          <div
            key={String(label)}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
          >
            <div className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {val}
            </div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
          <span>Progresso (itens concluídos / total)</span>
          <span>
            {c?.doneCount ?? 0}/{c?.totalLeads ?? 0} ({pct}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-overlay)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--text-accent)" }} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Lead
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Imóvel
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Motoboy
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Status
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Evid. / Score
              </th>
              <th className="p-2" style={{ color: "var(--text-tertiary)" }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="p-2">{it.contactName}</td>
                <td className="max-w-[180px] truncate p-2" title={it.imovel}>
                  {it.imovel}
                </td>
                <td className="p-2 text-xs">{it.motoboyName ?? "—"}</td>
                <td className="p-2 text-xs">
                  {STATUS_LABEL[it.uiStatus] ?? it.uiStatus}
                  {it.error && (
                    <span className="block text-red-500" title={it.error}>
                      {it.error.slice(0, 80)}
                    </span>
                  )}
                </td>
                <td className="p-2 text-xs">
                  {it.evidenceCount} / {it.score != null ? `${it.score.toFixed(1)}/10` : "—"}
                </td>
                <td className="p-2">
                  {it.reportUrl && (
                    <a
                      href={it.reportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs"
                      style={{ color: "var(--text-accent)" }}
                    >
                      Ver PDF
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
