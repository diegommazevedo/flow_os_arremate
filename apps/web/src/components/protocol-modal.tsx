"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

interface ProtocolMessage {
  id: string;
  direction: "IN" | "OUT" | "NOTE";
  canal: string;
  conteudo: string;
  autorId: string | null;
  createdAt: string;
}

interface ProtocolData {
  id: string;
  number: string;
  status: string;
  canal: string;
  assunto: string | null;
  createdAt: string;
  updatedAt: string;
  resolvidoEm: string | null;
  mensagens: ProtocolMessage[];
}

const STATUS_OPTIONS = ["ABERTO", "EM_ATENDIMENTO", "AGUARDANDO", "RESOLVIDO", "FECHADO"] as const;
const CANAL_OPTIONS = ["WHATSAPP", "PWA", "INTERNO"] as const;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProtocolModal({
  open,
  protocolId,
  dealId,
  onClose,
  onUpdated,
}: {
  open: boolean;
  protocolId: string | null;
  dealId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyChannel, setReplyChannel] = useState<(typeof CANAL_OPTIONS)[number]>("WHATSAPP");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !dealId || !protocolId) return;

    setError(null);
    fetch(`/api/protocols?dealId=${encodeURIComponent(dealId)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Falha ao carregar protocolo")))
      .then((payload: { protocols?: ProtocolData[] }) => {
        const next = (payload.protocols ?? []).find((item) => item.id === protocolId) ?? null;
        setProtocol(next);
        if (next) {
          setReplyChannel((next.canal === "PWA" || next.canal === "INTERNO") ? next.canal : "WHATSAPP");
        }
      })
      .catch((cause: unknown) => {
        setProtocol(null);
        setError(cause instanceof Error ? cause.message : "Falha ao carregar protocolo");
      });
  }, [open, dealId, protocolId]);

  const sortedMessages = useMemo(
    () => [...(protocol?.mensagens ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [protocol],
  );

  if (!open || !protocolId || !dealId) return null;

  const updateStatus = async (status: (typeof STATUS_OPTIONS)[number]) => {
    const response = await fetch(`/api/protocols/${protocolId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) throw new Error("Falha ao atualizar status");

    const payload = await response.json() as { protocol: ProtocolData };
    setProtocol((current) => current ? { ...current, ...payload.protocol } : payload.protocol);
    onUpdated?.();
  };

  const sendMessage = async () => {
    if (!replyText.trim()) return;

    const response = await fetch(`/api/protocols/${protocolId}/mensagens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conteudo: replyText,
        canal: replyChannel,
        direction: "OUT",
      }),
    });

    if (!response.ok) throw new Error("Falha ao enviar mensagem");

    const payload = await response.json() as { mensagem: ProtocolMessage };
    setProtocol((current) =>
      current
        ? { ...current, mensagens: [...current.mensagens, payload.mensagem] }
        : current,
    );
    setReplyText("");
    onUpdated?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Protocolo</div>
            <div className="text-lg font-semibold text-white">{protocol?.number ?? protocolId}</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={protocol?.status ?? "ABERTO"}
              onChange={(event) => startTransition(() => { void updateStatus(event.target.value as (typeof STATUS_OPTIONS)[number]); })}
              className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              {protocol?.canal ?? "WHATSAPP"}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col border-r border-gray-800">
            <div className="border-b border-gray-800 px-5 py-3 text-sm text-gray-400">
              {protocol?.assunto ?? "Sem assunto"} · {protocol?.createdAt ? formatDateTime(protocol.createdAt) : "—"}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {error && <div className="mb-3 rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>}
              {sortedMessages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
                  Nenhuma mensagem registrada neste protocolo.
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedMessages.map((message) => (
                    <div
                      key={message.id}
                      className={[
                        "rounded-2xl border px-4 py-3",
                        message.direction === "IN"
                          ? "border-gray-800 bg-gray-900"
                          : message.direction === "NOTE"
                            ? "border-amber-900/40 bg-amber-950/30"
                            : "border-brand-500/30 bg-brand-500/10",
                      ].join(" ")}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-semibold text-gray-300">{message.direction}</span>
                        <span>{message.autorId ?? "Cliente"}</span>
                        <span>·</span>
                        <span>{message.canal}</span>
                        <span>·</span>
                        <span>{formatDateTime(message.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-gray-100">{message.conteudo}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Canal de resposta</div>
              <select
                value={replyChannel}
                onChange={(event) => setReplyChannel(event.target.value as (typeof CANAL_OPTIONS)[number])}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              >
                {CANAL_OPTIONS.map((canal) => (
                  <option key={canal} value={canal}>{canal}</option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Resposta</div>
              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                rows={8}
                placeholder="Digite a resposta do protocolo..."
                className="h-full min-h-[180px] w-full rounded-2xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={isPending || !replyText.trim()}
                onClick={() => startTransition(() => { void sendMessage(); })}
                className="w-full rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50"
              >
                Enviar resposta
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => { void updateStatus("RESOLVIDO"); })}
                className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300"
              >
                Marcar como resolvido
              </button>
              <Link
                href={`/interno?dealId=${encodeURIComponent(dealId)}`}
                className="block w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white"
              >
                Discussão interna →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
