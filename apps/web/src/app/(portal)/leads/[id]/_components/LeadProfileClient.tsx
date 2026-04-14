"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TagSelector, type TagLite } from "@/components/TagSelector";
import { maskPhoneTail } from "@/lib/phone-mask";

interface LeadPayload {
  contact: {
    id: string;
    name: string;
    phone: string | null;
    document: string | null;
    leadLifecycle: string;
    createdAt: string;
    tags: TagLite[];
  };
  deals: Array<{
    id: string;
    title: string;
    meta: unknown;
    dossier: {
      id: string;
      status: string;
      fieldScore: unknown;
      reportUrl: string | null;
      aiSummary: string | null;
    } | null;
    evidences: Array<{ id: string; type: string; mediaUrl: string; mimeType: string }>;
  }>;
  campaignItems: Array<{
    id: string;
    status: string;
    campaign: { id: string; name: string; status: string; type: string };
  }>;
  chatTaskIds: string[];
}

type Tab = "dados" | "wa" | "dossie" | "campanhas";

export function LeadProfileClient() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("dados");
  const [data, setData] = useState<LeadPayload | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/leads/${id}`);
    if (!r.ok) {
      setErr("Lead não encontrado");
      return;
    }
    setData((await r.json()) as LeadPayload);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err || !data) {
    return <p style={{ color: "var(--text-tertiary)" }}>{err || "Carregando…"}</p>;
  }

  const c = data.contact;
  const primary = data.deals[0] ?? null;
  const meta = (primary?.meta ?? {}) as Record<string, unknown>;
  const dossier = primary?.dossier ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {c.name}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {maskPhoneTail(c.phone)} · {c.leadLifecycle}
          </p>
        </div>
        <Link href="/leads" className="text-sm" style={{ color: "var(--text-accent)" }}>
          ← Leads
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: "var(--border-subtle)" }}>
        {(
          [
            ["dados", "Dados"],
            ["wa", "Histórico WA"],
            ["dossie", "Dossiê"],
            ["campanhas", "Campanhas"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="rounded-lg px-3 py-1 text-sm"
            style={{
              background: tab === k ? "var(--surface-active)" : "transparent",
              color: tab === k ? "var(--text-accent)" : "var(--text-secondary)",
            }}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dados" && (
        <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)" }}>
          <p>
            <strong>Telefone:</strong> {c.phone ?? "—"}
          </p>
          <p>
            <strong>Documento:</strong> {c.document ? "••••" : "—"}
          </p>
          <div>
            <strong>Imóvel</strong>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {String(meta["imovelEndereco"] ?? meta["endereco"] ?? "—")}
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {String(meta["imovelCidade"] ?? meta["cidade"] ?? "—")} /{" "}
              {String(meta["imovelUF"] ?? meta["uf"] ?? "—")}
            </p>
          </div>
          <div>
            <strong>Etiquetas</strong>
            <div className="mt-2">
              <TagSelector contactId={c.id} initialTags={c.tags} onChange={() => void load()} />
            </div>
          </div>
        </div>
      )}

      {tab === "wa" && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            Abra a conversa no chat omnichannel.
          </p>
          {data.chatTaskIds.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Nenhuma task WA aberta ligada a este lead.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.chatTaskIds.map((tid) => (
                <li key={tid}>
                  <Link
                    href={`/chat?task=${tid}`}
                    className="text-sm underline"
                    style={{ color: "var(--text-accent)" }}
                  >
                    Abrir conversa ({tid.slice(0, 8)}…)
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "dossie" && (
        <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)" }}>
          {!dossier ? (
            <p style={{ color: "var(--text-tertiary)" }}>Sem dossiê ainda.</p>
          ) : (
            <>
              <p>
                <strong>Status:</strong> {dossier.status}
              </p>
              {dossier.fieldScore != null && (
                <p>
                  <strong>Score:</strong> {Number(dossier.fieldScore).toFixed(1)}/10
                </p>
              )}
              {dossier.aiSummary && (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {dossier.aiSummary}
                </p>
              )}
              {dossier.reportUrl && (
                <a
                  href={dossier.reportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-lg bg-[var(--text-accent)] px-3 py-1.5 text-sm text-white"
                >
                  Ver PDF
                </a>
              )}
              {dossier.status === "GENERATED" && (
                <button
                  type="button"
                  className="ml-2 rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border-default)" }}
                  onClick={() =>
                    void fetch(`/api/dossier/${dossier.id}/share`, { method: "POST" }).then(() =>
                      void load(),
                    )
                  }
                >
                  Enviar ao lead (WA)
                </button>
              )}
            </>
          )}
          {primary && primary.evidences.length > 0 && (
            <div>
              <strong className="block mb-2">Evidências</strong>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {primary.evidences.map((e) => (
                  <a key={e.id} href={e.mediaUrl} target="_blank" rel="noreferrer" className="block">
                    {e.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.mediaUrl}
                        alt=""
                        className="h-20 w-full rounded object-cover bg-[var(--surface-overlay)]"
                      />
                    ) : (
                      <div
                        className="flex h-20 items-center justify-center rounded text-[10px]"
                        style={{ background: "var(--surface-overlay)" }}
                      >
                        {e.mimeType.startsWith("video") ? "Vídeo" : "Arquivo"}
                      </div>
                    )}
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {e.type}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "campanhas" && (
        <ul className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)" }}>
          {data.campaignItems.length === 0 ? (
            <li style={{ color: "var(--text-tertiary)" }}>Nenhuma campanha.</li>
          ) : (
            data.campaignItems.map((ci) => (
              <li key={ci.id} className="flex flex-wrap justify-between gap-2 text-sm">
                <Link href={`/campanhas/${ci.campaign.id}`} style={{ color: "var(--text-accent)" }}>
                  {ci.campaign.name}
                </Link>
                <span style={{ color: "var(--text-secondary)" }}>
                  {ci.status} · {ci.campaign.type}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
