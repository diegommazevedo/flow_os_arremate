"use client";

/**
 * DocumentChecklist — Lista de documentos com upload.
 *
 * UX 45–50 anos:
 *   - Labels em linguagem do dia-a-dia: "Foto da sua CNH" não "CNH required"
 *   - Status visual claro: pendente (cinza), enviado (âmbar), aprovado (verde)
 *   - Botão de upload grande e visível
 *   - Tooltip com instrução ao passar o mouse / tocar
 */

import { useState } from "react";
import type { PortalDocument } from "../_lib/portal-queries";

interface Props {
  documents: PortalDocument[];
  dealId:    string;
}

export function DocumentChecklist({ documents, dealId }: Props) {
  // Separa por status para exibir pendentes primeiro
  const pending  = documents.filter(d => d.status === "pending");
  const uploaded = documents.filter(d => d.status === "uploaded");
  const approved = documents.filter(d => d.status === "approved");

  const ordered = [...pending, ...uploaded, ...approved];

  const pendingCount = pending.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

      {/* Resumo */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">
          {pendingCount === 0
            ? "✅ Todos os documentos enviados"
            : `${pendingCount} documento${pendingCount > 1 ? "s" : ""} pendente${pendingCount > 1 ? "s" : ""}`}
        </span>
        {pendingCount > 0 && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
            Aguardando
          </span>
        )}
      </div>

      {/* Lista */}
      <ul className="divide-y divide-gray-100" aria-label="Lista de documentos">
        {ordered.map(doc => (
          <DocumentItem key={doc.id} doc={doc} dealId={dealId} />
        ))}
      </ul>

    </div>
  );
}

// ─── Item de documento ────────────────────────────────────────────────────────

function DocumentItem({ doc, dealId }: { doc: PortalDocument; dealId: string }) {
  const [uploading,   setUploading]   = useState(false);
  const [localStatus, setLocalStatus] = useState<PortalDocument["status"]>(doc.status);
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);

  const isDone = localStatus === "approved";
  const isSent = localStatus === "uploaded";

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrorMsg(null);
    try {
      const form = new FormData();
      form.append("file",            file);
      form.append("dealId",          dealId);
      form.append("checklistItemId", doc.id);
      form.append("docLabel",        doc.label);

      const res = await fetch("/api/portal/upload-document", {
        method: "POST",
        body:   form,
      });

      if (res.ok) {
        setLocalStatus("uploaded");
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 413) {
          setErrorMsg("Arquivo muito grande. O limite é 10 MB.");
        } else if (res.status === 400) {
          setErrorMsg(data.error ?? "Tipo de arquivo não aceito. Use PDF, JPG ou PNG.");
        } else if (res.status === 403) {
          setErrorMsg("Sessão expirada. Reabra o link enviado por e-mail.");
        } else {
          setErrorMsg("Não foi possível enviar. Tente novamente.");
        }
      }
    } catch {
      setErrorMsg("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <li className="px-4 py-3 flex items-start gap-3">

      {/* Ícone de status */}
      <div className="flex-shrink-0 mt-0.5">
        {isDone ? (
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : isSent ? (
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <p
          className={[
            "text-base font-semibold leading-tight",
            isDone ? "text-gray-500 line-through" : "text-gray-900",
          ].join(" ")}
        >
          {doc.label}
          {doc.required && !isDone && (
            <span className="ml-1 text-red-500 text-sm" aria-label="obrigatório">*</span>
          )}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">{doc.description}</p>

        {/* Status */}
        {isSent && (
          <span className="inline-flex items-center mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
            ⏳ Aguardando análise da equipe
          </span>
        )}
        {isDone && (
          <span className="inline-flex items-center mt-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
            ✅ Aprovado
          </span>
        )}
        {errorMsg && (
          <p className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
            ⚠️ {errorMsg}
          </p>
        )}
      </div>

      {/* Botão de upload */}
      {!isDone && !isSent && (
        <div className="flex-shrink-0">
          <label
            htmlFor={`upload-${doc.id}`}
            className={[
              "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-colors min-h-[44px] min-w-[80px]",
              uploading
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800",
            ].join(" ")}
            aria-label={`Enviar ${doc.label}`}
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Enviar</span>
              </>
            )}
          </label>
          <input
            id={`upload-${doc.id}`}
            type="file"
            className="sr-only"
            accept="image/*,.pdf"
            disabled={uploading}
            onChange={handleUpload}
            aria-label={`Selecionar arquivo para ${doc.label}`}
          />
        </div>
      )}

    </li>
  );
}
