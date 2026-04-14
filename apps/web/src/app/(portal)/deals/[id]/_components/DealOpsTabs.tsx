"use client";

import { useCallback, useEffect, useState } from "react";
import type { DealDetailHistory } from "../_lib/deal-queries";

export type DealPrimarySection = "dados" | "vistoria" | "docs" | "relatorio" | "edital" | "historico";

interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  status: string;
  fileUrl?: string;
  extractedData?: unknown;
}

export function DealOpsTabs({
  section,
  dealId,
  history,
}: {
  section: Exclude<DealPrimarySection, "dados">;
  dealId: string;
  history: DealDetailHistory[];
}) {
  if (section === "historico") {
    const filtered = history.filter((h) => /DOSSIER|FIELD|PAYMENT/i.test(h.action));
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Histórico (dossiê / campo / pagamento)</h2>
        <ul className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-500">Sem eventos filtrados.</p>
          ) : (
            filtered.map((h) => (
              <li key={h.id} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-300">
                <span className="font-mono text-brand-400">{h.action}</span>
                <span className="ml-2 text-gray-500">{new Date(h.createdAt).toLocaleString("pt-BR")}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  if (section === "vistoria") {
    return <DealVistoria dealId={dealId} />;
  }
  if (section === "docs") {
    return <DealDocumentacao dealId={dealId} />;
  }
  if (section === "edital") {
    return <DealEdital dealId={dealId} />;
  }
  return <DealRelatorio dealId={dealId} />;
}

function DealVistoria({ dealId }: { dealId: string }) {
  const [data, setData] = useState<{
    assignments: Array<{
      id: string;
      status: string;
      priceAgreed: unknown;
      agent: { partner: { name: string; phone: string | null } };
      evidences: Array<{ id: string; type: string; mediaUrl: string }>;
      paymentOrder: { id: string; status: string; amount: number } | null;
    }>;
  } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}/field-overview`);
    if (!r.ok) return;
    setData(await r.json());
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (orderId: string) => {
    const r = await fetch(`/api/payment-orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (r.ok) void load();
  };

  if (!data) return <p className="text-sm text-gray-500">Carregando vistoria…</p>;

  return (
    <div className="space-y-4">
      {data.assignments.length === 0 ? (
        <p className="text-sm text-gray-500">Sem assignments de campo.</p>
      ) : (
        data.assignments.map((a) => (
          <div key={a.id} className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{a.agent.partner.name}</p>
                <p className="text-xs text-gray-500">{a.agent.partner.phone ?? "—"}</p>
              </div>
              <span className="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-300">{a.status}</span>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Pagamento:{" "}
              {a.paymentOrder
                ? `${a.paymentOrder.status} · R$ ${(a.paymentOrder.amount / 100).toFixed(2)}`
                : "—"}
            </p>
            {a.paymentOrder?.status === "PENDING" && (
              <button
                type="button"
                onClick={() => void approve(a.paymentOrder!.id)}
                className="mt-2 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
              >
                Aprovar pagamento
              </button>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {a.evidences.map((e) => (
                <a
                  key={e.id}
                  href={e.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate rounded border border-gray-800 bg-gray-900 px-2 py-1 text-[10px] text-brand-300"
                >
                  {e.type}
                </a>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DealDocumentacao({ dealId }: { dealId: string }) {
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [gateB, setGateB] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}/dossier-bundle`);
    if (!r.ok) return;
    const j = (await r.json()) as {
      dossier: { id: string; status: string } | null;
      checklist: { items: unknown; gateB: boolean } | null;
    };
    if (!j.dossier) {
      setDossierId(null);
      setItems([]);
      return;
    }
    setDossierId(j.dossier.id);
    const raw = j.checklist?.items;
    setItems(Array.isArray(raw) ? (raw as ChecklistItem[]) : []);
    setGateB(Boolean(j.checklist?.gateB));
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const es = new EventSource("/api/sse/kanban");
    es.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { type?: string; dealId?: string | null };
        if (msg.type === "GATE_B_UPDATE" && msg.dealId === dealId) {
          void load();
        }
      } catch {
        /* heartbeat / formato desconhecido */
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [dealId, load]);

  const upload = async (itemId: string, file: File) => {
    if (!dossierId) return;
    setBusy(itemId);
    const fd = new FormData();
    fd.set("file", file);
    const r = await fetch(`/api/dossier/${dossierId}/checklist/${itemId}/upload`, { method: "POST", body: fd });
    setBusy(null);
    if (r.ok) void load();
  };

  if (!dossierId) {
    return <p className="text-sm text-gray-500">Sem dossiê — dispare vistoria de campo primeiro.</p>;
  }

  const requiredDone = items.filter((i) => i.required && i.status === "done").length;
  const requiredTotal = items.filter((i) => i.required).length;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Documentação (Gate B)</h2>
        {gateB ? (
          <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">Gate B ✓</span>
        ) : (
          <span className="text-xs text-gray-500">
            {requiredDone}/{requiredTotal} obrigatórios
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
            <div>
              <span className="text-sm text-white">{it.label}</span>
              <span className="ml-2 text-xs text-gray-500">{it.status}</span>
            </div>
            <label className="cursor-pointer rounded bg-gray-800 px-2 py-1 text-xs text-brand-300">
              {busy === it.id ? "…" : "Upload PDF"}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(it.id, f);
                  e.target.value = "";
                }}
              />
            </label>
            {it.extractedData != null && (
              <pre className="mt-1 max-h-24 w-full overflow-auto text-[10px] text-gray-400">
                {JSON.stringify(it.extractedData, null, 0).slice(0, 400)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DealEdital({ dealId }: { dealId: string }) {
  const [edital, setEdital] = useState<{
    id: string; status: string; sourceType: string;
    leilaoDate: string | null; leilaoModalidade: string | null;
    leiloeiro: string | null; varaJudicial: string | null;
    valorAvaliacao: number | null; lanceMinimo: number | null;
    debitosEdital: Array<{ tipo: string; valor: number; descricao?: string }> | null;
    restricoes: string[] | null;
    fileUrl: string | null; sourceUrl: string | null;
    urgencyLevel: string; deliveryContext: string;
  } | null>(null);
  const [hunting, setHunting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}/edital`);
    if (!r.ok) return;
    const j = (await r.json()) as { edital: typeof edital };
    setEdital(j.edital);
  }, [dealId]);

  useEffect(() => { void load(); }, [load]);

  const hunt = async () => {
    setHunting(true);
    await fetch(`/api/deals/${dealId}/edital/hunt`, { method: "POST" });
    setHunting(false);
    setTimeout(() => void load(), 5000);
  };

  const uploadPdf = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    await fetch(`/api/deals/${dealId}/edital/upload`, { method: "POST", body: fd });
    setBusy(false);
    setTimeout(() => void load(), 3000);
  };

  if (!edital) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 text-center space-y-4">
        <p className="text-sm text-gray-400">📋 O edital orienta todo o processo — adicione agora</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={hunt} disabled={hunting}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-50">
            {hunting ? "Buscando..." : "🔍 Buscar automaticamente"}
          </button>
          <label className="cursor-pointer rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300">
            📄 Fazer upload manual
            <input type="file" accept="application/pdf" className="hidden" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPdf(f); e.target.value = ""; }} />
          </label>
        </div>
      </div>
    );
  }

  if (edital.status === "PROCESSING") {
    return (
      <div className="rounded-2xl border border-amber-800 bg-amber-950/20 p-6 text-center">
        <div className="mb-3 h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent mx-auto" />
        <p className="text-sm text-amber-300">Processando edital...</p>
      </div>
    );
  }

  if (edital.status === "PENDING") {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 text-center">
        <p className="text-sm text-gray-400">Edital aguardando processamento</p>
      </div>
    );
  }

  // DONE — dados extraídos
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Dados do Edital</h2>
        <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">{edital.sourceType}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {edital.leilaoDate && (
          <Field label="Data do leilão" value={new Date(edital.leilaoDate).toLocaleString("pt-BR")} />
        )}
        {edital.leilaoModalidade && <Field label="Modalidade" value={edital.leilaoModalidade} />}
        {edital.leiloeiro && <Field label="Leiloeiro" value={edital.leiloeiro} />}
        {edital.varaJudicial && <Field label="Vara judicial" value={edital.varaJudicial} />}
        {edital.valorAvaliacao != null && <Field label="Avaliação" value={`R$ ${(edital.valorAvaliacao / 100).toLocaleString("pt-BR")}`} />}
        {edital.lanceMinimo != null && <Field label="Lance mínimo" value={`R$ ${(edital.lanceMinimo / 100).toLocaleString("pt-BR")}`} />}
      </div>

      {edital.debitosEdital && edital.debitosEdital.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-gray-400">Débitos declarados</p>
          <ul className="space-y-1">
            {edital.debitosEdital.map((d, i) => (
              <li key={i} className="flex justify-between rounded border border-gray-800 bg-gray-900 px-3 py-1 text-xs">
                <span className="text-gray-300">{d.tipo}: {d.descricao ?? ""}</span>
                <span className="text-amber-300">R$ {(d.valor / 100).toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {edital.restricoes && edital.restricoes.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-gray-400">Restrições</p>
          <ul className="space-y-1">
            {edital.restricoes.map((r, i) => (
              <li key={i} className="text-xs text-red-300">⚠️ {r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        {edital.fileUrl && (
          <a href={edital.fileUrl} target="_blank" rel="noreferrer"
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-brand-300">
            📄 Ver PDF original
          </a>
        )}
        <label className="cursor-pointer rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300">
          🔄 Reprocessar
          <input type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPdf(f); e.target.value = ""; }} />
        </label>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase text-gray-500">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

function DealRelatorio({ dealId }: { dealId: string }) {
  const [dossier, setDossier] = useState<{
    id: string;
    status: string;
    reportUrl: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}/dossier-bundle`);
    if (!r.ok) return;
    const j = (await r.json()) as { dossier: typeof dossier };
    setDossier(j.dossier);
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  const consolidate = async (force: boolean) => {
    if (!dossier) return;
    await fetch(`/api/dossier/${dossier.id}/consolidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    void load();
  };

  if (!dossier) return <p className="text-sm text-gray-500">Sem dossiê.</p>;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-3">
      <p className="text-xs text-gray-500">Status: {dossier.status}</p>
      {dossier.status === "GENERATED" && dossier.reportUrl ? (
        <div className="space-y-2">
          <a
            href={dossier.reportUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-gray-950"
          >
            Baixar / ver PDF
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">Aguardando consolidação ou geração.</p>
          <button
            type="button"
            onClick={() => void consolidate(true)}
            className="rounded-lg border border-amber-700 px-3 py-1.5 text-xs text-amber-200"
          >
            Consolidar agora (forçar)
          </button>
        </div>
      )}
    </div>
  );
}
