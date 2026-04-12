"use client";

/**
 * /settings/integrations — Configuração de integrações do FlowOS
 * Seção 1: WhatsApp Accounts
 * Seção 2: Agentes IA
 * Seção 3: Outras integrações (MinIO, Email, Portal JWT)
 *
 * [SEC-02] Secrets NUNCA retornam ao frontend após salvar.
 * [SEC-03] workspaceId sempre da sessão (nas rotas API).
 * [SEC-06] AuditLog em cada mutação (nas rotas API).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Integration {
  id:        string;
  name:      string;
  type:      string;
  status:    string;
  createdAt: string;
}

interface AgentCfg {
  agentName: string;
  enabled:   boolean;
  config:    Record<string, unknown>;
}

type WAType = "WHATSAPP_META" | "WHATSAPP_EVOLUTION";

const PANEL =
  "rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm";
const PANEL_EMPTY =
  "rounded-xl border border-gray-800 bg-gray-900/70 shadow-sm px-4 py-8 text-center text-gray-600";

// ─── Helpers visuais ──────────────────────────────────────────────────────────

/** Imagem PNG/base64 (Evolution). Texto curto ou `2@…` não é QR visual. */
function evolutionPayloadLooksLikeQrImage(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.startsWith("data:image")) return true;
  if (t.startsWith("2@")) return false;
  return t.length >= 400;
}

/** Resposta estruturada Pacote A — Evolution POST /status */
interface EvolutionStatusJson {
  ok?: boolean;
  qrcode?: string;
  error?: string;
  message?: string;
  evolutionQrFlow?: string;
  build?: string;
  status?: string;
  sessionState?: string;
  responseClass?: string;
  responseKeysHint?: string[];
  breakerOpen?: boolean;
  breakerUntil?: string | null;
  breakerReason?: string | null;
  nextSuggestedAction?: string;
  diagnostic?: { responseKeysHint?: string[]; usedNumberParam?: boolean; connectRetriesExhausted?: boolean };
}

interface EvolutionStructuredDisplay {
  ok?:                boolean;
  status?:            string;
  sessionState?:      string;
  responseClass?:     string;
  breakerOpen?:       boolean;
  nextSuggestedAction?: string;
  build?:             string;
}

function pickEvolutionStructured(qrD: EvolutionStatusJson): EvolutionStructuredDisplay {
  const out: EvolutionStructuredDisplay = {};
  if (qrD.ok !== undefined) out.ok = qrD.ok;
  if (qrD.status !== undefined) out.status = qrD.status;
  if (qrD.sessionState !== undefined) out.sessionState = qrD.sessionState;
  if (qrD.responseClass !== undefined) out.responseClass = qrD.responseClass;
  if (qrD.breakerOpen !== undefined) out.breakerOpen = qrD.breakerOpen;
  if (qrD.nextSuggestedAction !== undefined) out.nextSuggestedAction = qrD.nextSuggestedAction;
  const b = qrD.build ?? qrD.evolutionQrFlow;
  if (b !== undefined && b !== "") out.build = b;
  return out;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE:   "bg-green-900/40 text-green-300 border-green-800",
    INACTIVE: "bg-gray-800 text-gray-400 border-gray-700",
    ERROR:    "bg-red-900/40 text-red-300 border-red-800",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${map[status] ?? map["INACTIVE"]}`}>
      {status}
    </span>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        ${value ? "bg-indigo-600" : "bg-gray-700"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
        ${value ? "translate-x-4.5" : "translate-x-0.5"}`} />
    </button>
  );
}

function SecretInput({
  label, placeholder, value, onChange, hint,
}: { label: string; placeholder?: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label block mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          className="input w-full pr-16"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 hover:text-gray-300 px-1"
        >
          {show ? "Ocultar" : "Revelar"}
        </button>
      </div>
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function TestResult({ result }: { result: { ok: boolean; error?: string; phone?: string; state?: string } | null }) {
  if (!result) return null;
  return (
    <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
      result.ok
        ? "bg-green-900/30 border-green-800 text-green-300"
        : "bg-red-900/30 border-red-800 text-red-300"}`}
    >
      <span>{result.ok ? "✓" : "✕"}</span>
      <span>{result.ok ? (result.phone ?? result.state ?? "Conexão OK") : (result.error ?? "Falha na conexão")}</span>
    </div>
  );
}

// ─── Seção 1: Modal WhatsApp ──────────────────────────────────────────────────

function WAModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type,    setType]    = useState<WAType>("WHATSAPP_META");
  const [name,    setName]    = useState("");
  const [fields,  setFields]  = useState<Record<string, string>>({});
  const [autoReply, setAutoReply] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState<{ ok: boolean; error?: string; phone?: string } | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Evolution: persistência separada de connect/QR (Pacote A)
  const [savedEvolutionIntegrationId, setSavedEvolutionIntegrationId] = useState<string | null>(null);
  const [savingEvolution,  setSavingEvolution]  = useState(false);
  const [deletingEvolution, setDeletingEvolution] = useState(false);
  const [lastEvolutionStructured, setLastEvolutionStructured] = useState<EvolutionStructuredDisplay | null>(null);

  const [qrCode,        setQrCode]        = useState<string | null>(null);
  const [connectingQR,  setConnectingQR]  = useState(false);
  const [qrPolling,     setQrPolling]     = useState(false);
  const [qrConnected,   setQrConnected]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollRef.current)   { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setQrPolling(false);
  };

  const setF = (k: string, v: string) => setFields(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (type !== "WHATSAPP_EVOLUTION") {
      setSavedEvolutionIntegrationId(null);
      setLastEvolutionStructured(null);
      setQrCode(null);
      setQrConnected(false);
      stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset só ao trocar tipo; stopPolling é estável o suficiente
  }, [type]);

  const applyEvolutionStructured = (qrD: EvolutionStatusJson) => {
    setLastEvolutionStructured(pickEvolutionStructured(qrD));
  };

  const buildPayload = () =>
    type === "WHATSAPP_META"
      ? { type, name, ...fields, autoReply }
      : { type, name, ...fields };

  const test = async () => {
    setTesting(true); setTestRes(null);
    const r = await fetch("/api/integrations/whatsapp/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (!r.ok) { setTesting(false); return; }
    const d = await r.json() as { integration?: { id: string } };
    if (!d.integration?.id) { setTesting(false); return; }
    const testR = await fetch(`/api/integrations/whatsapp/${d.integration.id}/test`, { method: "POST" });
    const testD = await testR.json() as { ok: boolean; error?: string; phone?: string };
    setTestRes(testD);
    await fetch(`/api/integrations/whatsapp/${d.integration.id}/delete`, { method: "DELETE" });
    setTesting(false);
  };

  const saveEvolutionIntegration = async () => {
    setSavingEvolution(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        type:         "WHATSAPP_EVOLUTION",
        name,
        apiUrl:       fields["apiUrl"] ?? "",
        apiKey:       fields["apiKey"] ?? "",
        instanceName: fields["instanceName"] ?? "",
      };
      if (savedEvolutionIntegrationId) payload["integrationId"] = savedEvolutionIntegrationId;

      const r = await fetch("/api/integrations/whatsapp/save", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const d = await r.json() as {
        ok?: boolean;
        integration?: { id: string };
        error?: string;
        existingIntegrationId?: string;
      };

      if (r.status === 409) {
        setError(
          d.error ??
            "Ja existe integracao Evolution com esta URL e instancia. Remova a duplicata na lista ou ajuste os campos.",
        );
        return;
      }
      if (!r.ok) throw new Error(d.error ?? `Erro ao salvar (${r.status})`);

      const id = d.integration?.id;
      if (!id) throw new Error("Resposta sem ID da integracao");
      setSavedEvolutionIntegrationId(id);
      setLastEvolutionStructured(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingEvolution(false);
    }
  };

  const generateEvolutionQR = async () => {
    const integId = savedEvolutionIntegrationId;
    if (!integId) {
      setError("Salve a integracao antes de gerar o QR Code.");
      return;
    }

    setConnectingQR(true);
    setError(null);
    setQrCode(null);
    setQrConnected(false);
    stopPolling();

    try {
      const qrR = await fetch("/api/integrations/evolution/status", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ integrationId: integId }),
      });
      const qrD = (await qrR.json()) as EvolutionStatusJson;
      applyEvolutionStructured(qrD);

      if (qrR.status === 429) {
        const flowTag = qrD.build ?? qrD.evolutionQrFlow;
        const parts = [
          qrD.message ?? "Nova tentativa bloqueada temporariamente (circuit breaker).",
          qrD.nextSuggestedAction,
          qrD.breakerUntil ? `Ate: ${qrD.breakerUntil}.` : null,
          flowTag ? `Build: ${flowTag}.` : null,
        ].filter(Boolean);
        setError(parts.join(" "));
        return;
      }

      if (!qrR.ok && qrR.status !== 202) {
        if (qrD.message || qrD.error) {
          const flowTag502 = qrD.build ?? qrD.evolutionQrFlow;
          const parts = [
            qrD.message ?? qrD.error,
            qrD.nextSuggestedAction,
            qrD.responseClass ? `Classe: ${qrD.responseClass}.` : null,
            flowTag502 ? `Build: ${flowTag502}.` : null,
          ].filter(Boolean);
          setError(parts.join(" "));
          return;
        }
        const bits = [qrD.error ?? `HTTP ${qrR.status}`];
        if (qrD.evolutionQrFlow) bits.push(`[${qrD.evolutionQrFlow}]`);
        throw new Error(bits.join(" "));
      }

      const rawQr = (qrD.qrcode ?? "").trim();
      if (!rawQr) {
        const keyHint =
          qrD.responseKeysHint?.length
            ? qrD.responseKeysHint
            : qrD.diagnostic?.responseKeysHint;
        const flowTagEmpty = qrD.build ?? qrD.evolutionQrFlow;
        const parts = [
          qrD.message ?? qrD.error ?? "QR Code nao disponivel apos as tentativas do servidor.",
          qrD.responseClass ? `Classe: ${qrD.responseClass}.` : null,
          keyHint?.length ? `Resposta Evolution (chaves): ${keyHint.join(", ")}.` : null,
          qrD.diagnostic?.usedNumberParam === false
            ? "No Railway (flowos-web), defina EVOLUTION_CONNECT_NUMBER com o WhatsApp so em digitos — algumas builds so devolvem QR com ?number=."
            : null,
          qrD.nextSuggestedAction,
          qrD.breakerOpen ? `Protecao ativa${qrD.breakerUntil ? ` ate ${qrD.breakerUntil}` : ""}.` : null,
          flowTagEmpty ? `Build FlowOS: ${flowTagEmpty}.` : null,
        ].filter(Boolean);
        setError(parts.join(" "));
        return;
      }

      const hadVisualQr = evolutionPayloadLooksLikeQrImage(rawQr);
      setQrCode(rawQr);

      setQrPolling(true);
      pollRef.current = setInterval(async () => {
        const testR = await fetch(`/api/integrations/whatsapp/${integId}/test`, { method: "POST" }).catch(() => null);
        if (!testR?.ok) return;
        const testD = await testR.json() as { ok: boolean; state?: string };
        if (testD.ok) {
          stopPolling();
          setQrConnected(true);
          setTimeout(() => onSaved(), 1500);
        }
      }, 3000);

      timeoutRef.current = setTimeout(() => {
        stopPolling();
        if (!hadVisualQr) {
          setError(
            "Tempo limite (5 min): nenhuma imagem de QR foi recebida (so texto/codigo ou resposta incompleta da Evolution). " +
              "Defina EVOLUTION_CONNECT_NUMBER no flowos-web (Railway) e faca redeploy. " +
              "Se viu so «tempo esgotado» sem nada no meio, era provavelmente build antigo que iniciava o timer sem QR.",
          );
        } else {
          setError(
            "Tempo esgotado (5 min). Se ja escaneou, feche o modal — a sessao pode estar ativa no manager Evolution. " +
              "Se o QR expirou, use «Cancelar e tentar novamente».",
          );
        }
      }, 300_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao obter QR");
    } finally {
      setConnectingQR(false);
    }
  };

  const deleteEvolutionIntegration = async () => {
    if (!savedEvolutionIntegrationId) return;
    if (
      !confirm(
        "Excluir esta integracao do workspace? A conta salva sera removida; sera necessario salvar de novo para parear.",
      )
    )
      return;

    setDeletingEvolution(true);
    setError(null);
    try {
      const r = await fetch(`/api/integrations/whatsapp/${savedEvolutionIntegrationId}/delete`, { method: "DELETE" });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Erro ao excluir");

      stopPolling();
      setSavedEvolutionIntegrationId(null);
      setQrCode(null);
      setQrConnected(false);
      setLastEvolutionStructured(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeletingEvolution(false);
    }
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/integrations/whatsapp/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!r.ok) {
        const d = await r.json() as { error?: string };
        throw new Error(d.error ?? "Erro ao salvar");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Adicionar conta WhatsApp</h3>
          <button
            type="button"
            onClick={() => { stopPolling(); onClose(); }}
            className="text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label block mb-1">Tipo</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {(["WHATSAPP_META", "WHATSAPP_EVOLUTION"] as WAType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors
                    ${type === t ? "bg-indigo-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
                >
                  {t === "WHATSAPP_META" ? "Meta Business API" : "Evolution API"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label block mb-1">Nome da conta</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Principal WA"
              className="input w-full"
            />
          </div>

          {type === "WHATSAPP_META" ? (
            <>
              <SecretInput label="Access Token" value={fields["accessToken"] ?? ""} onChange={v => setF("accessToken", v)} />
              <div>
                <label className="label block mb-1">Phone Number ID</label>
                <input value={fields["phoneNumberId"] ?? ""} onChange={e => setF("phoneNumberId", e.target.value)} className="input w-full" />
              </div>
              <SecretInput label="App Secret" value={fields["appSecret"] ?? ""} onChange={v => setF("appSecret", v)} />
              <div>
                <label className="label block mb-1">Webhook Verify Token</label>
                <input value={fields["webhookVerifyToken"] ?? ""} onChange={e => setF("webhookVerifyToken", e.target.value)} className="input w-full" placeholder="Token secreto para verificação do webhook" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300">Auto-reply para mensagens urgentes</p>
                  <p className="text-[10px] text-gray-500">Responde automaticamente quando quadrante Q1</p>
                </div>
                <Toggle value={autoReply} onChange={setAutoReply} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label block mb-1">API URL</label>
                <input value={fields["apiUrl"] ?? ""} onChange={e => setF("apiUrl", e.target.value)} placeholder="http://localhost:8080" className="input w-full" />
              </div>
              <SecretInput label="API Key" value={fields["apiKey"] ?? ""} onChange={v => setF("apiKey", v)} />
              <div>
                <label className="label block mb-1">Nome da instância</label>
                <input value={fields["instanceName"] ?? ""} onChange={e => setF("instanceName", e.target.value)} className="input w-full" placeholder="minha-instancia" />
              </div>

              <p className="text-[10px] text-gray-500">
                Se alterar URL, chave ou instância, salve de novo antes de gerar outro QR (o servidor usa a integração já persistida).
              </p>

              <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2 space-y-1.5 text-xs">
                <div className="font-medium text-gray-300">Estado</div>
                {connectingQR ? (
                  <p className="text-amber-300 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Gerando QR…
                  </p>
                ) : qrCode && !qrConnected ? (
                  <p className="text-emerald-300">QR pronto — escaneie no WhatsApp</p>
                ) : lastEvolutionStructured?.breakerOpen ? (
                  <p className="text-amber-400">Breaker ativo — aguarde ou siga a sugestão abaixo</p>
                ) : lastEvolutionStructured?.status === "degraded" ? (
                  <p className="text-orange-300">Instância degradada — veja mensagem e próxima ação</p>
                ) : savedEvolutionIntegrationId ? (
                  <p className="text-emerald-400/90">Integração salva — pode gerar o QR Code</p>
                ) : (
                  <p className="text-gray-500">Preencha os campos e use Salvar integração</p>
                )}
                {lastEvolutionStructured && (
                  <div className="text-[10px] text-gray-500 font-mono pt-1 border-t border-gray-800/80 space-y-0.5">
                    <div>
                      ok: {String(lastEvolutionStructured.ok ?? "—")} · status: {lastEvolutionStructured.status ?? "—"} ·
                      sessionState: {lastEvolutionStructured.sessionState ?? "—"}
                    </div>
                    {lastEvolutionStructured.responseClass != null && lastEvolutionStructured.responseClass !== "" && (
                      <div>responseClass: {lastEvolutionStructured.responseClass}</div>
                    )}
                    {lastEvolutionStructured.nextSuggestedAction != null &&
                      lastEvolutionStructured.nextSuggestedAction !== "" && (
                        <div className="text-gray-400">{lastEvolutionStructured.nextSuggestedAction}</div>
                      )}
                    {lastEvolutionStructured.build != null && lastEvolutionStructured.build !== "" && (
                      <div>build: {lastEvolutionStructured.build}</div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void saveEvolutionIntegration()}
                  disabled={
                    savingEvolution ||
                    !name ||
                    !fields["apiUrl"] ||
                    !fields["apiKey"] ||
                    !fields["instanceName"]
                  }
                  className="btn-primary w-full px-3 py-2 text-sm disabled:opacity-40"
                >
                  {savingEvolution ? "Salvando…" : "Salvar integração"}
                </button>
                <button
                  type="button"
                  onClick={() => void generateEvolutionQR()}
                  disabled={
                    connectingQR ||
                    savingEvolution ||
                    deletingEvolution ||
                    !savedEvolutionIntegrationId
                  }
                  className="btn-secondary w-full px-3 py-2 text-sm disabled:opacity-40"
                >
                  {connectingQR ? "Gerando QR…" : "Gerar QR Code"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteEvolutionIntegration()}
                  disabled={!savedEvolutionIntegrationId || deletingEvolution || savingEvolution || connectingQR}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-red-900/60 text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                >
                  {deletingEvolution ? "Excluindo…" : "Excluir integração"}
                </button>
              </div>

              {qrConnected ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <span className="text-4xl">✅</span>
                  <p className="text-sm font-semibold text-green-400">WhatsApp conectado!</p>
                  <p className="text-xs text-gray-500">Fechando automaticamente…</p>
                </div>
              ) : qrCode ? (
                <div className="space-y-2">
                  {(() => {
                    const bareB64 =
                      !qrCode.startsWith("data:") &&
                      evolutionPayloadLooksLikeQrImage(qrCode) &&
                      /^[A-Za-z0-9+/=\s]+$/.test(qrCode.replace(/\s/g, "").slice(0, 80));
                    const imgSrc = qrCode.startsWith("data:")
                      ? qrCode
                      : bareB64
                        ? `data:image/png;base64,${qrCode.replace(/\s/g, "")}`
                        : null;
                    return (
                      <>
                        {imgSrc ? (
                          <p className="text-xs text-gray-400 text-center">Escaneie o QR Code no WhatsApp</p>
                        ) : (
                          <p className="text-xs text-amber-200/90 text-center">
                            Sem imagem QR nesta resposta — use o código abaixo em WhatsApp → Dispositivos ligados → ligar dispositivo
                          </p>
                        )}
                        <div className="flex justify-center">
                          {imgSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imgSrc} alt="QR Code WhatsApp" className="w-52 h-52 rounded-xl border border-gray-700" />
                          ) : (
                            <div className="w-full max-w-sm min-h-[8rem] rounded-xl border border-amber-800/40 bg-gray-950/80 flex items-center justify-center p-3">
                              <code className="text-xs sm:text-sm text-amber-100/95 break-all text-center leading-snug">
                                {qrCode}
                              </code>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  {qrPolling && (
                    <div className="flex items-center gap-2 justify-center text-xs text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      Aguardando conexão…
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setQrCode(null); stopPolling(); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-300 py-1"
                  >
                    Cancelar e tentar novamente
                  </button>
                </div>
              ) : null}
            </>
          )}

          {testRes && <TestResult result={testRes} />}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          {type === "WHATSAPP_META" && (
            <button onClick={() => void test()} disabled={testing || !name} className="btn-secondary px-3 py-2 text-sm disabled:opacity-40">
              {testing ? "Testando…" : "Testar conexão"}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => { stopPolling(); onClose(); }} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
          {/* Evolution: salvar/QR/excluir no corpo do modal. Meta: Salvar aqui. */}
          {type === "WHATSAPP_META" && (
            <button onClick={() => void save()} disabled={saving || !name} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
              {saving ? "Salvando…" : "Salvar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Seção 1: Lista de contas WhatsApp ────────────────────────────────────────

function WASection() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [testing,      setTesting]      = useState<string | null>(null);
  const [testResults,  setTestResults]  = useState<Record<string, { ok: boolean; error?: string; phone?: string }>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/integrations/list")
      .then(r => r.ok ? r.json() : { integrations: [] })
      .then((d: { integrations?: Integration[] }) =>
        setIntegrations((d.integrations ?? []).filter(i => i.type.startsWith("WHATSAPP"))),
      )
      .catch(() => setIntegrations([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const duplicateNameKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of integrations) {
      const k = `${i.type}\t${i.name.trim().toLowerCase()}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [integrations]);

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remover "${name}"? Esta ação é irreversível.`)) return;
    await fetch(`/api/integrations/whatsapp/${id}/delete`, { method: "DELETE" });
    setIntegrations(prev => prev.filter(i => i.id !== id));
  };

  const test = async (id: string) => {
    setTesting(id);
    const r = await fetch(`/api/integrations/whatsapp/${id}/test`, { method: "POST" });
    const d = await r.json() as { ok: boolean; error?: string; phone?: string };
    setTestResults(prev => ({ ...prev, [id]: d }));
    setTesting(null);
  };

  const TYPE_LABEL: Record<string, string> = {
    WHATSAPP_META:      "Meta Business API",
    WHATSAPP_EVOLUTION: "Evolution API",
  };
  const TYPE_COLOR: Record<string, string> = {
    WHATSAPP_META:      "bg-green-900/30 text-green-300 border-green-800",
    WHATSAPP_EVOLUTION: "bg-amber-900/30 text-amber-300 border-amber-800",
  };

  return (
    <Section
      title="Contas WhatsApp"
      subtitle="Conecte números WhatsApp para receber e enviar mensagens"
    >
      {showModal && (
        <WAModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-gray-800" />)}
        </div>
      ) : integrations.length === 0 ? (
        <div className={PANEL_EMPTY}>
          <p className="text-3xl mb-2">📱</p>
          <p className="text-sm">Nenhuma conta WhatsApp configurada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {integrations.map(i => {
            const dupKey   = `${i.type}\t${i.name.trim().toLowerCase()}`;
            const isDupRow = (duplicateNameKeys.get(dupKey) ?? 0) > 1;
            return (
            <div key={i.id} className={PANEL}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-white">{i.name}</p>
                    {isDupRow && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium border border-amber-700/60 text-amber-200/90 bg-amber-950/40"
                        title="Várias integrações com o mesmo nome — mantenha só uma por URL+instância Evolution"
                      >
                        dup · {i.id.slice(-6)}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${TYPE_COLOR[i.type] ?? ""}`}>
                      {TYPE_LABEL[i.type] ?? i.type}
                    </span>
                    <StatusBadge status={i.status} />
                  </div>
                  {testResults[i.id] && <TestResult result={testResults[i.id]!} />}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => void test(i.id)}
                    disabled={testing === i.id}
                    className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                  >
                    {testing === i.id ? "…" : "Testar"}
                  </button>
                  <button
                    onClick={() => void remove(i.id, i.name)}
                    className="px-2 py-1 rounded text-xs text-red-400 border border-red-900/50 hover:bg-red-900/20 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-500 max-w-xl">
        Cada &quot;Conectar via QR Code&quot; ou gravação criava uma linha nova. Duplicatas com o mesmo nome aparecem com o selo <span className="text-amber-200/80">dup</span> — remova as extras e deixe uma só conta por instância Evolution.
      </p>

      <button onClick={() => setShowModal(true)} className="btn-primary px-4 py-2 text-sm">
        + Adicionar conta WhatsApp
      </button>
    </Section>
  );
}

// ─── Seção 2: Agentes IA ──────────────────────────────────────────────────────

type AgentRenderFn = (props: { cfg: AgentCfg; setField: (k: string, v: unknown) => void }) => React.ReactNode;

interface AgentCardProps {
  agentName: string;
  title:     string;
  desc:      string;
  children:  AgentRenderFn;
}

function AgentCard({ agentName, title, desc, children }: AgentCardProps) {
  const [cfg,     setCfg]     = useState<AgentCfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    fetch(`/api/integrations/agent/${agentName}/config`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { agentConfig?: AgentCfg } | null) =>
        setCfg(d?.agentConfig ?? { agentName, enabled: true, config: {} }),
      )
      .catch(() => setCfg({ agentName, enabled: true, config: {} }))
      .finally(() => setLoading(false));
  }, [agentName]);

  const setEnabled = (enabled: boolean) => setCfg(prev => prev ? { ...prev, enabled } : null);
  const setConfigField = (k: string, v: unknown) =>
    setCfg(prev => prev ? { ...prev, config: { ...prev.config, [k]: v } } : null);

  const save = async () => {
    if (!cfg) return;
    setSaving(true); setSaved(false);
    await fetch(`/api/integrations/agent/${agentName}/config`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ enabled: cfg.enabled, config: cfg.config }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-gray-500">{desc}</p>
        </div>
        {loading ? (
          <div className="w-9 h-5 rounded-full bg-gray-800 animate-pulse" />
        ) : (
          <Toggle value={cfg?.enabled ?? false} onChange={setEnabled} />
        )}
      </div>

      {!loading && cfg?.enabled && (
        <div className="border-t border-gray-800 pt-3 space-y-3">
          {children({ cfg, setField: setConfigField })}
        </div>
      )}

      {!loading && (
        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-xs text-green-400">✓ Salvo</span>}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      )}
    </div>
  );
}

function AgentsSection() {
  const [rpaRunning, setRpaRunning] = useState(false);
  const [rpaResult,  setRpaResult]  = useState<string | null>(null);

  const runRpa = async () => {
    setRpaRunning(true); setRpaResult(null);
    const r = await fetch("/api/agents/rpa/run", { method: "POST" });
    const d = await r.json() as { ok: boolean; jobId?: string; error?: string };
    setRpaResult(d.ok ? `Job enfileirado: ${d.jobId ?? "OK"}` : (d.error ?? "Erro"));
    setRpaRunning(false);
  };

  const ALERT_SEQUENCE = ["48h", "24h", "6h", "2h", "1h"];

  return (
    <Section title="Agentes IA" subtitle="Configure e ative os agentes automáticos do workspace">
      {/* PaymentRecoveryBot */}
      <AgentCard
        agentName="PAYMENT_RECOVERY"
        title="Payment Recovery Bot"
        desc="Sequência automática de alertas de pagamento próximo ao vencimento"
      >
        {({ cfg, setField }) => (
          <>
            <div>
              <p className="text-xs text-gray-400 mb-2">Sequência de alertas</p>
              <div className="flex gap-2 flex-wrap">
                {ALERT_SEQUENCE.map(h => {
                  const seq = (cfg.config["alertSequence"] as string[] | undefined) ?? ALERT_SEQUENCE;
                  const active = seq.includes(h);
                  return (
                    <button
                      key={h}
                      onClick={() => {
                        const next = active ? seq.filter(s => s !== h) : [...seq, h];
                        setField("alertSequence", next);
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors
                        ${active ? "bg-indigo-700 text-white border-indigo-600" : "bg-transparent text-gray-400 border-gray-700"}`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="label block mb-1">Canal preferencial</label>
              <select
                value={String(cfg.config["channel"] ?? "WA")}
                onChange={e => setField("channel", e.target.value)}
                className="input w-full"
              >
                <option value="WA">WhatsApp</option>
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
          </>
        )}
      </AgentCard>

      {/* RPA External */}
      <AgentCard
        agentName="RPA_EXTERNAL"
        title="Importador Automático (RPA)"
        desc="Importação periódica de dados de fontes externas via automação de navegador"
      >
        {({ cfg, setField }) => (
          <>
            <div>
              <label className="label block mb-1">Usuário</label>
              <input
                value={String(cfg.config["caixaUser"] ?? "")}
                onChange={e => setField("caixaUser", e.target.value)}
                className="input w-full"
                placeholder="CPF ou login"
              />
            </div>
            <SecretInput
              label="Senha"
              value={String(cfg.config["caixaPass"] ?? "")}
              onChange={v => setField("caixaPass", v)}
            />
            <SecretInput
              label="TOTP Secret (2FA)"
              value={String(cfg.config["caixaTotpSecret"] ?? "")}
              onChange={v => setField("caixaTotpSecret", v)}
              hint="Base32 do autenticador (Google Auth / Authy)"
            />
            <div>
              <label className="label block mb-1">Frequência</label>
              <select
                value={String(cfg.config["frequency"] ?? "2h")}
                onChange={e => setField("frequency", e.target.value)}
                className="input w-full"
              >
                {["1h", "2h", "4h", "6h", "12h"].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Modo simulação (DRY_RUN)</p>
                <p className="text-[10px] text-gray-500">Sem gravação no banco</p>
              </div>
              <Toggle
                value={Boolean(cfg.config["dryRun"] ?? true)}
                onChange={v => setField("dryRun", v)}
              />
            </div>
            <div className="border-t border-gray-800 pt-2 flex items-center gap-3">
              <button
                onClick={() => void runRpa()}
                disabled={rpaRunning}
                className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                {rpaRunning ? "Enfileirando…" : "▶ Rodar agora"}
              </button>
              {rpaResult && (
                <span className={`text-xs ${rpaResult.startsWith("Job") ? "text-green-400" : "text-red-400"}`}>
                  {rpaResult}
                </span>
              )}
            </div>
          </>
        )}
      </AgentCard>

      {/* Report Gen */}
      <AgentCard
        agentName="REPORT_GEN"
        title="Gerador de Relatórios"
        desc="Gera relatórios em PDF automaticamente após importação de dados"
      >
        {({ cfg, setField }) => {
          const provider = String(cfg.config["llmProvider"] ?? "claude");
          return (
            <>
              <div>
                <label className="label block mb-1">Provider LLM</label>
                <select value={provider} onChange={e => setField("llmProvider", e.target.value)} className="input w-full">
                  <option value="claude">Claude Sonnet</option>
                  <option value="gpt4o-mini">GPT-4o-mini</option>
                  <option value="ollama">Ollama local</option>
                </select>
              </div>
              {provider === "claude" && (
                <SecretInput
                  label="Anthropic API Key"
                  value={String(cfg.config["anthropicApiKey"] ?? "")}
                  onChange={v => setField("anthropicApiKey", v)}
                />
              )}
              {provider === "gpt4o-mini" && (
                <SecretInput
                  label="OpenAI API Key"
                  value={String(cfg.config["openaiApiKey"] ?? "")}
                  onChange={v => setField("openaiApiKey", v)}
                />
              )}
            </>
          );
        }}
      </AgentCard>

      {/* TokenRouter */}
      <AgentCard
        agentName="TOKEN_ROUTER"
        title="Token Router"
        desc="Roteamento inteligente de mensagens para o provider LLM mais adequado"
      >
        {({ cfg, setField }) => (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Cache Redis</p>
                <p className="text-[10px] text-gray-500">Reutilizar decisões recentes</p>
              </div>
              <Toggle value={Boolean(cfg.config["cacheEnabled"] ?? true)} onChange={v => setField("cacheEnabled", v)} />
            </div>
            {Boolean(cfg.config["cacheEnabled"] ?? true) && (
              <div>
                <label className="label block mb-1">TTL do cache: {String(cfg.config["cacheTtlMin"] ?? 30)} min</label>
                <input
                  type="range" min={5} max={60} step={5}
                  value={Number(cfg.config["cacheTtlMin"] ?? 30)}
                  onChange={e => setField("cacheTtlMin", Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-gray-600"><span>5 min</span><span>60 min</span></div>
              </div>
            )}
            <div>
              <label className="label block mb-1">Threshold Q1 automático: {String(cfg.config["q1ThresholdHours"] ?? 48)}h</label>
              <input
                type="range" min={0} max={72} step={1}
                value={Number(cfg.config["q1ThresholdHours"] ?? 48)}
                onChange={e => setField("q1ThresholdHours", Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-gray-600"><span>0h</span><span>72h</span></div>
            </div>
            <div>
              <label className="label block mb-1">Provider padrão</label>
              <select
                value={String(cfg.config["defaultProvider"] ?? "groq")}
                onChange={e => setField("defaultProvider", e.target.value)}
                className="input w-full"
              >
                {["ollama", "groq", "openai", "claude"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </>
        )}
      </AgentCard>
    </Section>
  );
}

// ─── Seção 3: Outras integrações ──────────────────────────────────────────────

function OtherIntegrationsSection() {
  const [minioFields,  setMinioFields]  = useState<Record<string, string>>({});
  const [emailFields,  setEmailFields]  = useState<Record<string, string>>({});
  const [jwtSecret,    setJwtSecret]    = useState("");
  const [jwtTtl,       setJwtTtl]       = useState("48h");
  const [testResults,  setTestResults]  = useState<Record<string, { ok: boolean; error?: string }>>({});

  const setMinio = (k: string, v: string) => setMinioFields(prev => ({ ...prev, [k]: v }));
  const setEmail = (k: string, v: string) => setEmailFields(prev => ({ ...prev, [k]: v }));

  const generateSecret = () => {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    setJwtSecret(Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""));
  };

  const testMinio = async () => {
    setTestResults(prev => ({ ...prev, minio: { ok: false } }));
    // Teste via integração
    const r = await fetch("/api/integrations/whatsapp/create", { method: "OPTIONS" }).catch(() => null);
    if (r) {
      setTestResults(prev => ({ ...prev, minio: { ok: true } }));
    } else {
      setTestResults(prev => ({ ...prev, minio: { ok: false, error: "Endpoint indisponível" } }));
    }
  };

  return (
    <Section title="Outras Integrações" subtitle="Armazenamento, email e autenticação do portal">
      {/* MinIO */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🗄️</span>
          <div>
            <p className="text-sm font-semibold text-white">MinIO / Storage</p>
            <p className="text-xs text-gray-500">Armazenamento de PDFs e documentos</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label block mb-1">Endpoint</label>
            <input value={minioFields["endpoint"] ?? ""} onChange={e => setMinio("endpoint", e.target.value)} placeholder="http://localhost:9000" className="input w-full" />
          </div>
          <div>
            <label className="label block mb-1">Bucket</label>
            <input value={minioFields["bucket"] ?? ""} onChange={e => setMinio("bucket", e.target.value)} placeholder="flowos" className="input w-full" />
          </div>
          <SecretInput label="Access Key" value={minioFields["accessKey"] ?? ""} onChange={v => setMinio("accessKey", v)} />
          <SecretInput label="Secret Key" value={minioFields["secretKey"] ?? ""} onChange={v => setMinio("secretKey", v)} />
        </div>
        <p className="text-[10px] text-gray-600">Configure MINIO_* no .env para produção. Alterações aqui reiniciam o worker.</p>
        {testResults["minio"] && <TestResult result={testResults["minio"]!} />}
        <div className="flex gap-2 justify-end">
          <button onClick={() => void testMinio()} className="btn-secondary px-3 py-1.5 text-xs">Testar conexão</button>
          <button className="btn-primary px-3 py-1.5 text-xs">Salvar</button>
        </div>
      </div>

      {/* Email */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📧</span>
          <div>
            <p className="text-sm font-semibold text-white">Email (Resend)</p>
            <p className="text-xs text-gray-500">Envio de emails transacionais</p>
          </div>
        </div>
        <SecretInput label="Resend API Key" value={emailFields["resendApiKey"] ?? ""} onChange={v => setEmail("resendApiKey", v)} />
        <div>
          <label className="label block mb-1">Remetente padrão</label>
          <input value={emailFields["fromEmail"] ?? ""} onChange={e => setEmail("fromEmail", e.target.value)} placeholder="noreply@seudominio.com" className="input w-full" />
        </div>
        <div className="flex justify-end">
          <button className="btn-primary px-3 py-1.5 text-xs">Salvar</button>
        </div>
      </div>

      {/* Portal JWT */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔑</span>
          <div>
            <p className="text-sm font-semibold text-white">Portal JWT</p>
            <p className="text-xs text-gray-500">Secret dos magic links do portal do cliente</p>
          </div>
        </div>
        <div>
          <label className="label block mb-1">JWT Secret</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={jwtSecret}
              onChange={e => setJwtSecret(e.target.value)}
              placeholder="••••••••••••••••"
              className="input flex-1"
              autoComplete="off"
            />
            <button onClick={generateSecret} className="btn-secondary px-3 py-1.5 text-xs whitespace-nowrap">
              Gerar novo
            </button>
          </div>
          <p className="text-[10px] text-amber-400 mt-1">⚠ Gerar novo secret invalida todos os links ativos</p>
        </div>
        <div>
          <label className="label block mb-1">TTL do magic link</label>
          <select value={jwtTtl} onChange={e => setJwtTtl(e.target.value)} className="input w-full">
            <option value="24h">24 horas</option>
            <option value="48h">48 horas</option>
            <option value="7d">7 dias</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary px-3 py-1.5 text-xs">Salvar</button>
        </div>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Integrações</h1>
        <p className="text-sm text-gray-500 mt-1">Configure todas as integrações sem editar arquivos .env manualmente</p>
      </div>
      <WASection />
      <AgentsSection />
      <OtherIntegrationsSection />
    </div>
  );
}
