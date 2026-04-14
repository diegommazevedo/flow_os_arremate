"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

interface MissionItem {
  id: string;
  label: string;
  required: boolean;
  enabled: boolean;
  baseValue: number;
  bonusValue: number;
  skipAllowed: boolean;
  order: number;
}

interface Profile {
  name: string;
  level: string;
  bandeiradaValue: number;
  maxValue: number;
  currency: string;
  items: MissionItem[];
  skipPenalty: boolean;
  skipRequiresText: boolean;
  skipMinChars: number;
  skipMaxItems: number;
  skipReasons: string[];
  deadlineHours: number;
}

interface ItemState {
  id: string;
  status: "pending" | "done" | "skipped";
  mediaUrl?: string;
  mimeType?: string;
  skipReason?: string;
}

type Screen =
  | "SEM_TELEFONE"
  | "CONFIRMACAO"
  | "BLOQUEADO"
  | "MISSAO"
  | "CHECKLIST"
  | "ITEM_ATIVO"
  | "PREVIEW_DONE"
  | "SKIP"
  | "PAGAMENTO"
  | "SUCESSO";

interface Props {
  token: string;
  assignmentId: string;
  agentName: string;
  phoneMasked: string | null;
  phoneConfirmAvailable: boolean;
  confirmLocked: boolean;
  itemStatesMeta: Record<string, { status?: string; skipReason?: string; savedAt?: string }>;
  evidenceByItem: Record<string, { mediaUrl: string; mimeType: string }>;
  descricaoTexto: string;
  savedProgressCount: number;
  imovel: { endereco: string; cidade: string; uf: string };
  profile: Profile | null;
  prefilledCpf: string;
  prefilledEmail: string;
  prefilledPixKey: string;
  prefilledPixKeyType: string;
}

function lsConfirmKey(assignmentId: string): string {
  return `vistoria_confirmed_${assignmentId}`;
}

function calcPayment(items: MissionItem[], states: ItemState[], profile: Profile): number {
  const bandComplete = items.filter(i => i.required).every(i => {
    const s = states.find(st => st.id === i.id);
    return s?.status === "done";
  });
  if (!bandComplete) return 0;
  let total = profile.bandeiradaValue;
  items.filter(i => !i.required && i.enabled).forEach(i => {
    const s = states.find(st => st.id === i.id);
    if (s?.status === "done") total += i.baseValue + i.bonusValue;
  });
  return Math.min(total, profile.maxValue);
}

function PaymentMeter({ value, bandeirada, max }: { value: number; bandeirada: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bandPct = max > 0 ? (bandeirada / max) * 100 : 50;
  const color = value >= max ? "#22C55E" : value >= bandeirada ? "#7C6AF7" : "#3B82F6";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span style={{ color: "#8B8B9E" }}>R$ 0</span>
        <span style={{ color, fontWeight: 700 }}>R$ {(value / 100).toFixed(2)}</span>
        <span style={{ color: "#8B8B9E" }}>R$ {(max / 100).toFixed(2)}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        <div className="absolute top-0 h-full w-0.5" style={{ left: `${bandPct}%`, background: "#F59E0B" }} />
      </div>
      <p className="text-center text-xs" style={{ color: "#8B8B9E" }}>
        Bandeirada: R$ {(bandeirada / 100).toFixed(2)}
      </p>
    </div>
  );
}

function formatCpfMask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let o = p1;
  if (p2) o += `.${p2}`;
  if (p3) o += `.${p3}`;
  if (p4) o += `-${p4}`;
  return o;
}

function digitsCpf(s: string): string {
  return s.replace(/\D/g, "").slice(0, 11);
}

function buildItemStates(
  items: MissionItem[],
  evidenceByItem: Props["evidenceByItem"],
  itemStatesMeta: Props["itemStatesMeta"],
): ItemState[] {
  return items.map(i => {
    const ev = evidenceByItem[i.id];
    if (ev) return { id: i.id, status: "done" as const, mediaUrl: ev.mediaUrl, mimeType: ev.mimeType };
    const m = itemStatesMeta[i.id];
    if (m?.status === "skipped") {
      const s: ItemState = { id: i.id, status: "skipped" };
      if (m.skipReason) s.skipReason = m.skipReason;
      return s;
    }
    return { id: i.id, status: "pending" as const };
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

export function VistoriaApp({
  token,
  assignmentId,
  agentName,
  phoneMasked,
  phoneConfirmAvailable,
  confirmLocked,
  itemStatesMeta,
  evidenceByItem,
  descricaoTexto: initialDescricao,
  savedProgressCount,
  imovel,
  profile,
  prefilledCpf,
  prefilledEmail,
  prefilledPixKey,
  prefilledPixKeyType,
}: Props) {
  const items = (profile?.items ?? []).filter(i => i.enabled).sort((a, b) => a.order - b.order);

  const [screen, setScreen] = useState<Screen>("MISSAO");
  const [lastFour, setLastFour] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [gpsOk, setGpsOk] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [itemStates, setItemStates] = useState<ItemState[]>(() => buildItemStates(items, evidenceByItem, itemStatesMeta));
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [skipItemId, setSkipItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    total: number;
    breakdown: Array<{ itemId: string; label: string; value: number; status: string }>;
    pixPendente?: boolean;
  } | null>(null);

  const [cpf, setCpf] = useState(prefilledCpf ? formatCpfMask(prefilledCpf) : "");
  const [email, setEmail] = useState(prefilledEmail);
  const [pixKeyType, setPixKeyType] = useState(prefilledPixKeyType || "CPF");
  const [pixKey, setPixKey] = useState(prefilledPixKey);

  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [capturePreviewUrl, setCapturePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (captureFile) {
      const u = URL.createObjectURL(captureFile);
      setCapturePreviewUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setCapturePreviewUrl(null);
    return undefined;
  }, [captureFile]);

  useEffect(() => {
    const d = digitsCpf(cpf);
    if (pixKeyType === "CPF" && d.length === 11) setPixKey(d);
  }, [cpf, pixKeyType]);

  useEffect(() => {
    if (pixKeyType === "EMAIL" && email.trim()) setPixKey(email.trim().toLowerCase());
  }, [email, pixKeyType]);

  useEffect(() => {
    if (confirmLocked) {
      setScreen("BLOQUEADO");
      return;
    }
    if (!phoneConfirmAvailable) {
      setScreen("SEM_TELEFONE");
      return;
    }
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem(lsConfirmKey(assignmentId)) === "1") {
        const hasProgress =
          savedProgressCount > 0 ||
          Object.keys(evidenceByItem).length > 0 ||
          initialDescricao.trim().length > 0;
        setScreen(hasProgress ? "CHECKLIST" : "MISSAO");
        return;
      }
    } catch {
      /* ignore */
    }
    setScreen("CONFIRMACAO");
  }, [assignmentId, confirmLocked, phoneConfirmAvailable, savedProgressCount, evidenceByItem, initialDescricao]);

  const payment = profile ? calcPayment(items, itemStates, profile) : 0;
  const requiredDone = items.filter(i => i.required).every(i => itemStates.find(s => s.id === i.id)?.status === "done");
  const canFinish = requiredDone && gpsOk;

  const requestGps = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsOk(true);
      },
      () => alert("Não foi possível obter sua localização. Verifique as permissões."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const patchItemState = useCallback(
    async (itemId: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/vistoria/${token}/item/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    },
    [token],
  );

  const uploadFile = useCallback(
    async (itemId: string, file: File, durationSec?: number): Promise<boolean> => {
      setUploading(true);
      const form = new FormData();
      form.append("itemId", itemId);
      form.append("file", file);
      if (gps) {
        form.append("gpsLat", String(gps.lat));
        form.append("gpsLng", String(gps.lng));
      }
      if (durationSec != null) form.append("duration", String(durationSec));
      try {
        const res = await fetch(`/api/vistoria/${token}/upload`, { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; mediaUrl?: string; itemId?: string } | null;
        if (res.ok && data?.ok && data.mediaUrl) {
          await patchItemState(itemId, { status: "done" });
          const url = data.mediaUrl;
          setItemStates(prev =>
            prev.map(s =>
              s.id === itemId
                ? { id: s.id, status: "done" as const, mediaUrl: url, mimeType: file.type }
                : s,
            ),
          );
          setCaptureFile(null);
          setScreen("CHECKLIST");
          setUploading(false);
          return true;
        }
        alert("Erro ao enviar. Tente novamente.");
      } catch {
        alert("Erro de conexão.");
      }
      setUploading(false);
      return false;
    },
    [token, gps, patchItemState],
  );

  const onConfirmPhone = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/vistoria/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastFourDigits: lastFour }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; locked?: boolean; error?: string } | null;
      if (res.status === 403 || data?.locked) {
        setScreen("BLOQUEADO");
        return;
      }
      if (data?.ok) {
        try {
          localStorage.setItem(lsConfirmKey(assignmentId), "1");
        } catch {
          /* ignore */
        }
        const hasProgress =
          savedProgressCount > 0 ||
          Object.keys(evidenceByItem).length > 0 ||
          initialDescricao.trim().length > 0;
        setConfirming(false);
        setScreen(hasProgress ? "CHECKLIST" : "MISSAO");
        return;
      }
      setConfirmError(data?.error ?? "Número incorreto. Tente novamente.");
    } catch {
      setConfirmError("Erro de conexão.");
    }
    setConfirming(false);
  };

  const submitCadastro = async (): Promise<boolean> => {
    const res = await fetch(`/api/vistoria/${token}/cadastro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cpf: digitsCpf(cpf),
        email: email.trim(),
        pixKeyType,
        pixKey: pixKey.trim(),
      }),
    });
    return res.ok;
  };

  const submitVistoria = async (pixPendente: boolean) => {
    setSubmitting(true);
    const skipped = itemStates.filter(s => s.status === "skipped").map(s => ({ itemId: s.id, reason: s.skipReason ?? "" }));
    try {
      const res = await fetch(`/api/vistoria/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gps, skippedItems: skipped, pixPendente }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          payment?: { total: number; breakdown: Array<{ itemId: string; label: string; value: number; status: string }> };
          pixPendente?: boolean;
        };
        setPaymentResult({
          total: data.payment?.total ?? 0,
          breakdown: data.payment?.breakdown ?? [],
          ...(data.pixPendente === true ? { pixPendente: true } : {}),
        });
        setScreen("SUCESSO");
      } else {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? "Erro ao concluir.");
      }
    } catch {
      alert("Erro de conexão.");
    }
    setSubmitting(false);
  };

  const card = { background: "#111118", borderRadius: 12, padding: 20, marginBottom: 16 };
  const btn = (bg: string) =>
    ({
      background: bg,
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "14px 0",
      width: "100%",
      fontSize: 16,
      fontWeight: 600,
      cursor: "pointer",
    }) as const;

  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "SEM_TELEFONE") {
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 60 }}>
        <p style={{ fontSize: 40, marginBottom: 16 }}>📵</p>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Validação indisponível</h1>
        <p style={{ color: "#8B8B9E", marginTop: 12, fontSize: 14 }}>
          Não encontramos um número de celular para confirmar esta missão. Entre em contato com a equipe.
        </p>
      </div>
    );
  }

  if (screen === "BLOQUEADO") {
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 60 }}>
        <p style={{ fontSize: 40, marginBottom: 16 }}>🔒</p>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Link bloqueado</h1>
        <p style={{ color: "#8B8B9E", marginTop: 12 }}>Entre em contato com a equipe para receber um novo link.</p>
      </div>
    );
  }

  if (screen === "CONFIRMACAO" && phoneConfirmAvailable) {
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Confirme seu número</h1>
        <p style={{ color: "#8B8B9E", fontSize: 14, marginBottom: 20 }}>Este link foi enviado para:</p>
        <div style={{ ...card, textAlign: "center", fontSize: 18, fontWeight: 600 }}>{phoneMasked}</div>
        <label htmlFor="last4" style={{ display: "block", fontSize: 13, color: "#8B8B9E", marginBottom: 8 }}>
          Digite os 4 últimos dígitos do seu celular
        </label>
        <input
          id="last4"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={lastFour}
          onChange={e => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="0000"
          aria-label="Quatro últimos dígitos do celular"
          style={{
            width: "100%",
            background: "#1A1A24",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: 14,
            color: "#F0F0F5",
            fontSize: 20,
            letterSpacing: 6,
            textAlign: "center",
            marginBottom: 16,
          }}
        />
        {confirmError && <p style={{ color: "#E84040", fontSize: 14, marginBottom: 12 }}>{confirmError}</p>}
        <button
          type="button"
          style={btn("#7C6AF7")}
          disabled={lastFour.length !== 4 || confirming}
          onClick={onConfirmPhone}
          aria-label="Confirmar número"
        >
          {confirming ? "Verificando…" : "Confirmar"}
        </button>
      </div>
    );
  }

  if (screen === "MISSAO") {
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Missão de Vistoria</h1>
        <p style={{ color: "#8B8B9E", fontSize: 14, marginBottom: 20 }}>Olá {agentName}!</p>

        {profile?.level === "UP" && (
          <div style={{ ...card, background: "rgba(232,64,64,0.08)", border: "1px solid rgba(232,64,64,0.3)" }}>
            <p style={{ color: "#E84040", fontSize: 14, fontWeight: 600 }}>⚠️ Missão Complexa — regras especiais</p>
          </div>
        )}

        <div style={card}>
          <p style={{ color: "#8B8B9E", fontSize: 12, marginBottom: 4 }}>IMÓVEL</p>
          <p style={{ fontSize: 16, fontWeight: 600 }}>📍 {imovel.endereco || `${imovel.cidade}/${imovel.uf}`}</p>
        </div>

        {profile && (
          <>
            <div style={card}>
              <p style={{ color: "#8B8B9E", fontSize: 12, marginBottom: 8 }}>PAGAMENTO</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Bandeirada</span>
                <span style={{ fontWeight: 700 }}>R$ {(profile.bandeiradaValue / 100).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Teto máximo</span>
                <span style={{ fontWeight: 700, color: "#22C55E" }}>R$ {(profile.maxValue / 100).toFixed(2)}</span>
              </div>
            </div>

            <div style={card}>
              <p style={{ color: "#8B8B9E", fontSize: 12, marginBottom: 8 }}>ITENS DA MISSÃO</p>
              {items.map(i => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    fontSize: 14,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span>
                    {i.required ? "⭐ " : ""}
                    {i.label}
                  </span>
                  <span style={{ color: "#8B8B9E" }}>
                    {i.baseValue > 0 ? `+R$ ${((i.baseValue + i.bonusValue) / 100).toFixed(2)}` : "obrig."}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <button type="button" style={btn("#7C6AF7")} onClick={() => setScreen("CHECKLIST")} aria-label="Aceitar missão">
          Aceitar missão
        </button>
        <button type="button" style={{ ...btn("transparent"), color: "#8B8B9E", marginTop: 8 }} onClick={() => window.close()}>
          Recusar
        </button>
      </div>
    );
  }

  if (screen === "PAGAMENTO") {
    const inputStyle = {
      width: "100%",
      background: "#1A1A24",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      padding: 12,
      color: "#F0F0F5",
      fontSize: 14,
      marginBottom: 12,
    } as const;
    const hasPrev = Boolean(prefilledCpf || prefilledEmail);
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Quase lá!</h2>
        <p style={{ color: "#8B8B9E", fontSize: 14, marginBottom: 8 }}>Informe os dados para receber pelo serviço prestado</p>
        {profile && (
          <div style={{ ...card, border: "1px solid #22C55E55" }}>
            <p style={{ fontSize: 12, color: "#8B8B9E", marginBottom: 4 }}>Você vai receber</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#22C55E" }}>R$ {(payment / 100).toFixed(2)}</p>
            <p style={{ fontSize: 13, color: "#8B8B9E", marginTop: 4 }}>via PIX em até 2h</p>
          </div>
        )}
        {hasPrev && <p style={{ fontSize: 12, color: "#7C6AF7", marginBottom: 8 }}>Dados de missão anterior pré-preenchidos — confira.</p>}
        <label style={{ fontSize: 12, color: "#8B8B9E" }}>CPF</label>
        <input
          aria-label="CPF"
          value={cpf}
          onChange={e => setCpf(formatCpfMask(e.target.value))}
          placeholder="000.000.000-00"
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: "#8B8B9E" }}>E-mail</label>
        <input aria-label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={inputStyle} />
        <label style={{ fontSize: 12, color: "#8B8B9E" }}>Tipo chave PIX</label>
        <select aria-label="Tipo chave PIX" value={pixKeyType} onChange={e => setPixKeyType(e.target.value)} style={inputStyle}>
          <option value="CPF">CPF</option>
          <option value="EMAIL">E-mail</option>
          <option value="PHONE">Telefone</option>
          <option value="EVP">Chave aleatória</option>
        </select>
        <label style={{ fontSize: 12, color: "#8B8B9E" }}>Chave PIX</label>
        <input aria-label="Chave PIX" value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="Chave PIX" style={inputStyle} />
        <button
          type="button"
          style={btn(digitsCpf(cpf).length === 11 && email.trim() && pixKey.trim() ? "#22C55E" : "#333")}
          disabled={digitsCpf(cpf).length !== 11 || !email.trim() || !pixKey.trim() || submitting}
          onClick={async () => {
            if (!(await submitCadastro())) {
              alert("Erro ao salvar dados. Verifique e tente novamente.");
              return;
            }
            await submitVistoria(false);
          }}
          aria-label="Confirmar e concluir missão com dados de pagamento"
        >
          {submitting ? "Concluindo…" : "Confirmar e concluir"}
        </button>
        <button
          type="button"
          style={{ ...btn("transparent"), color: "#8B8B9E", marginTop: 12, fontSize: 14 }}
          disabled={submitting}
          onClick={() => submitVistoria(true)}
          aria-label="Pular cadastro de pagamento agora"
        >
          Pular — receber depois
        </button>
        <button type="button" style={{ ...btn("transparent"), color: "#8B8B9E", marginTop: 8 }} onClick={() => setScreen("CHECKLIST")}>
          Voltar ao checklist
        </button>
      </div>
    );
  }

  if (screen === "CHECKLIST") {
    const doneCount = itemStates.filter(s => s.status === "done").length;
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Checklist</h2>
        {savedProgressCount > 0 && (
          <div
            style={{
              ...card,
              background: "rgba(124,106,247,0.12)",
              border: "1px solid rgba(124,106,247,0.35)",
              marginBottom: 12,
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: "#C4B5FD" }}>Vistoria retomada</p>
            <p style={{ fontSize: 13, color: "#8B8B9E", marginTop: 4 }}>
              {savedProgressCount} {savedProgressCount === 1 ? "item já salvo" : "itens já salvos"} — continue de onde parou.
            </p>
          </div>
        )}

        <div style={{ ...card, border: gpsOk ? "1px solid #22C55E" : "1px solid #F59E0B" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{gpsOk ? "✅ GPS confirmado" : "📍 Confirme sua localização"}</span>
            {!gpsOk && (
              <button
                type="button"
                style={{ ...btn("#3B82F6"), width: "auto", padding: "8px 16px", fontSize: 13 }}
                onClick={requestGps}
                aria-label="Ativar GPS"
              >
                Ativar GPS
              </button>
            )}
          </div>
          {gps && (
            <p style={{ fontSize: 11, color: "#8B8B9E", marginTop: 4 }}>
              {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} (±{gps.accuracy.toFixed(0)}m)
            </p>
          )}
        </div>

        {profile && (
          <div style={card}>
            <PaymentMeter value={payment} bandeirada={profile.bandeiradaValue} max={profile.maxValue} />
          </div>
        )}

        {items.map(i => {
          const state = itemStates.find(s => s.id === i.id);
          const isDone = state?.status === "done";
          const isSkipped = state?.status === "skipped";
          return (
            <div
              key={i.id}
              role="button"
              tabIndex={0}
              aria-label={`Item ${i.label}, ${isDone ? "concluído" : isSkipped ? "pulado" : "pendente"}`}
              style={{
                ...card,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                border: isDone ? "1px solid #22C55E" : isSkipped ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.08)",
              }}
              onClick={() => {
                if (isDone) {
                  setPreviewItemId(i.id);
                  setScreen("PREVIEW_DONE");
                } else if (!isSkipped) {
                  setActiveItemId(i.id);
                  setCaptureFile(null);
                  setScreen("ITEM_ATIVO");
                }
              }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  (e.target as HTMLElement).click();
                }
              }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: isDone ? 600 : 400, textDecoration: isSkipped ? "line-through" : "none" }}>
                  {isDone ? "✅ " : isSkipped ? "⏭️ " : "○ "}
                  {i.required ? "⭐ " : ""}
                  {i.label}
                </p>
                {i.baseValue > 0 && !isSkipped && (
                  <p style={{ fontSize: 12, color: "#8B8B9E" }}>+R$ {((i.baseValue + i.bonusValue) / 100).toFixed(2)}</p>
                )}
                {isSkipped && state?.skipReason && (
                  <p style={{ fontSize: 11, color: "#8B8B9E", marginTop: 4 }}>{state.skipReason}</p>
                )}
              </div>
              {!isDone && !isSkipped && i.skipAllowed && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setSkipItemId(i.id);
                    setScreen("SKIP");
                  }}
                  style={{ fontSize: 12, color: "#8B8B9E", background: "none", border: "none", cursor: "pointer" }}
                  aria-label={`Pular ${i.label}`}
                >
                  Pular
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          style={{ ...btn(canFinish ? "#22C55E" : "#333"), marginTop: 8 }}
          disabled={!canFinish}
          onClick={() => setScreen("PAGAMENTO")}
          aria-label="Concluir missão e ir para dados de pagamento"
        >
          {canFinish ? "Concluir missão" : `Concluir (${doneCount}/${items.length} itens + GPS)`}
        </button>
      </div>
    );
  }

  if (screen === "PREVIEW_DONE" && previewItemId) {
    const item = items.find(i => i.id === previewItemId);
    const state = itemStates.find(s => s.id === previewItemId);
    if (!item || !state?.mediaUrl) {
      return (
        <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
          <button type="button" onClick={() => setScreen("CHECKLIST")} style={{ background: "none", border: "none", color: "#7C6AF7", marginBottom: 16, cursor: "pointer" }}>
            ← Voltar
          </button>
          <p style={{ color: "#8B8B9E" }}>Sem mídia anexada (texto salvo no servidor).</p>
          <button type="button" style={{ ...btn("#7C6AF7"), marginTop: 16 }} onClick={() => { setActiveItemId(previewItemId); setCaptureFile(null); setScreen("ITEM_ATIVO"); }} aria-label="Refazer item">
            Refazer
          </button>
        </div>
      );
    }
    const isVideo = state.mimeType?.startsWith("video/");
    const isAudio = state.mimeType?.startsWith("audio/");
    const isImage = state.mimeType?.startsWith("image/");
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <button type="button" onClick={() => setScreen("CHECKLIST")} style={{ background: "none", border: "none", color: "#7C6AF7", marginBottom: 16, cursor: "pointer" }}>
          ← Voltar
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{item.label}</h2>
        {isVideo && <video src={state.mediaUrl} controls style={{ width: "100%", borderRadius: 8, maxHeight: "70vh" }} aria-label="Pré-visualização do vídeo" />}
        {isAudio && <audio src={state.mediaUrl} controls style={{ width: "100%", marginBottom: 16 }} aria-label="Pré-visualização do áudio" />}
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.mediaUrl} alt={item.label} style={{ width: "100%", borderRadius: 8, maxHeight: "70vh", objectFit: "contain" }} />
        )}
        {!isVideo && !isAudio && !isImage && (
          <a href={state.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#7C6AF7", fontSize: 15 }} aria-label="Abrir arquivo enviado">
            Abrir arquivo enviado
          </a>
        )}
        <button
          type="button"
          style={{ ...btn("#7C6AF7"), marginTop: 16 }}
          onClick={() => {
            setActiveItemId(previewItemId);
            setCaptureFile(null);
            setScreen("ITEM_ATIVO");
          }}
          aria-label="Refazer captura deste item"
        >
          Refazer
        </button>
      </div>
    );
  }

  if (screen === "ITEM_ATIVO" && activeItemId) {
    const item = items.find(i => i.id === activeItemId);
    if (!item) {
      setScreen("CHECKLIST");
      return null;
    }
    const isPhoto = item.id.startsWith("fach") || item.id.startsWith("viz") || item.id.startsWith("acc") || item.id.startsWith("fund");
    const isVideo = item.id.startsWith("v");
    const isAudio = item.id === "audio";
    const isText = item.id === "text";

    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => {
            setCaptureFile(null);
            setScreen("CHECKLIST");
          }}
          style={{ background: "none", border: "none", color: "#7C6AF7", fontSize: 14, marginBottom: 16, cursor: "pointer" }}
        >
          ← Voltar
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{item.label}</h2>
        {item.baseValue > 0 && <p style={{ color: "#22C55E", fontSize: 14, marginBottom: 16 }}>+R$ {((item.baseValue + item.bonusValue) / 100).toFixed(2)}</p>}

        {uploading && <p style={{ color: "#F59E0B", textAlign: "center", padding: 40 }}>Salvando…</p>}

        {!uploading && (isPhoto || isVideo) && !captureFile && (
          <CaptureInput
            accept={isPhoto ? "image/*" : "video/*"}
            label={isPhoto ? "Tirar foto" : "Gravar vídeo"}
            onFile={f => setCaptureFile(f)}
          />
        )}

        {!uploading && (isPhoto || isVideo) && captureFile && capturePreviewUrl && (
          <div>
            <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden", maxHeight: "75vh" }}>
              {isVideo ? (
                <video src={capturePreviewUrl} controls style={{ width: "100%", display: "block" }} aria-label="Pré-visualização" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capturePreviewUrl} alt="Pré-visualização" style={{ width: "100%", display: "block", objectFit: "contain" }} />
              )}
            </div>
            <button type="button" style={btn("#22C55E")} onClick={() => void uploadFile(item.id, captureFile)} aria-label="Usar esta mídia">
              {isPhoto ? "Usar esta foto" : "Usar este vídeo"}
            </button>
            <button type="button" style={{ ...btn("#333"), marginTop: 8 }} onClick={() => setCaptureFile(null)} aria-label="Capturar novamente">
              {isPhoto ? "Tirar outra" : "Gravar novamente"}
            </button>
          </div>
        )}

        {!uploading && isAudio && (
          <AudioFlow onUpload={(file, sec) => uploadFile(item.id, file, sec)} />
        )}

        {!uploading && isText && (
          <TextFlow itemId={item.id} initialText={initialDescricao} minHint={50} patchItemState={patchItemState} uploadEvidence={uploadFile} />
        )}
      </div>
    );
  }

  if (screen === "SKIP" && skipItemId && profile) {
    return (
      <SkipScreen
        item={items.find(i => i.id === skipItemId)!}
        profile={profile}
        onSkip={async reason => {
          const ok = await patchItemState(skipItemId, { status: "skipped", skipReason: reason });
          if (ok) {
            setItemStates(prev => prev.map(s => (s.id === skipItemId ? { ...s, status: "skipped" as const, skipReason: reason } : s)));
            setScreen("CHECKLIST");
          } else alert("Erro ao salvar.");
        }}
        onCancel={() => setScreen("CHECKLIST")}
      />
    );
  }

  if (screen === "SUCESSO" && paymentResult) {
    const pk = pixKey.trim();
    const maskPix = pk.length > 6 ? `${pk.slice(0, 3)}…${pk.slice(-3)}` : "chave informada";
    return (
      <div style={{ padding: 20, maxWidth: 480, margin: "0 auto", paddingTop: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 12, textAlign: "center" }}>🎉</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>Missão concluída!</h2>
        <p style={{ fontSize: 18, color: "#22C55E", fontWeight: 700, textAlign: "center" }}>
          R$ {(paymentResult.total / 100).toFixed(2)}
        </p>
        {paymentResult.pixPendente ? (
          <p style={{ color: "#8B8B9E", fontSize: 14, marginTop: 16, textAlign: "center" }}>
            Enviamos um WhatsApp para confirmar seus dados de pagamento.
          </p>
        ) : (
          <p style={{ color: "#8B8B9E", fontSize: 14, marginTop: 16, textAlign: "center" }}>
            PIX de R$ {(paymentResult.total / 100).toFixed(2)} em até 2h para {maskPix}
          </p>
        )}
        <div style={{ ...card, marginTop: 24 }}>
          <p style={{ fontSize: 12, color: "#8B8B9E", marginBottom: 8 }}>Resumo</p>
          {paymentResult.breakdown.map(row => (
            <div key={row.itemId + row.status} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
              <span>{row.label}</span>
              <span style={{ color: row.status === "done" || row.status === "base" ? "#22C55E" : "#8B8B9E" }}>
                {row.value > 0 ? `R$ ${(row.value / 100).toFixed(2)}` : row.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CaptureInput({ accept, label, onFile }: { accept: string; label: string; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture="environment"
        style={{ display: "none" }}
        aria-label={label}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} style={btnStatic("#7C6AF7")} aria-label={label}>
        📸 {label}
      </button>
    </div>
  );
}

function btnStatic(bg: string) {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "20px 40px",
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
  } as const;
}

function AudioFlow({ onUpload }: { onUpload: (f: File, sec: number) => void }) {
  const [phase, setPhase] = useState<"idle" | "rec" | "preview">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (blob) {
      const u = URL.createObjectURL(blob);
      setPreviewUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setPreviewUrl(null);
    return undefined;
  }, [blob]);

  useEffect(() => {
    if (phase !== "rec") return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = e => chunksRef.current.push(e.data);
    mr.onstop = () => {
      const b = new Blob(chunksRef.current, { type: "audio/webm" });
      setBlob(b);
      stream.getTracks().forEach(t => t.stop());
      setPhase("preview");
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setSeconds(0);
    setPhase("rec");
  };

  const stop = () => {
    mediaRecorderRef.current?.stop();
    setPhase("idle");
  };

  const shortWarn = seconds < 30;

  if (phase === "preview" && blob && previewUrl) {
    return (
      <div style={{ textAlign: "center", padding: 24 }}>
        <div
          style={{
            height: 40,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 3,
            marginBottom: 16,
          }}
          aria-hidden
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: `${12 + ((i * 17) % 28)}px`,
                background: "#7C6AF7",
                borderRadius: 2,
                animation: "vistoriaPulse 0.8s ease-in-out infinite",
                animationDelay: `${i * 0.06}s`,
              }}
            />
          ))}
        </div>
        <audio src={previewUrl} controls style={{ width: "100%", marginBottom: 16 }} aria-label="Ouvir áudio gravado" />
        <button
          type="button"
          style={btnStatic("#22C55E")}
          onClick={() => {
            const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
            onUpload(file, seconds);
          }}
          aria-label="Usar este áudio"
        >
          Usar este áudio
        </button>
        <button
          type="button"
          style={{ ...btnStatic("#333"), marginTop: 8 }}
          onClick={() => {
            setBlob(null);
            setSeconds(0);
            setPhase("idle");
          }}
          aria-label="Gravar novamente"
        >
          Gravar novamente
        </button>
        <style>{`@keyframes vistoriaPulse { 0%,100%{opacity:.35;transform:scaleY(.6)}50%{opacity:1;transform:scaleY(1)} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: 40 }}>
      {phase === "idle" && (
        <button type="button" onClick={start} style={btnStatic("#E84040")} aria-label="Iniciar gravação de áudio">
          Gravar
        </button>
      )}
      {phase === "rec" && (
        <>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </div>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#E84040",
              margin: "0 auto 16px",
              animation: "pulse 1s infinite",
            }}
          />
          {shortWarn && <p style={{ color: "#F59E0B", fontSize: 13, marginBottom: 12 }}>Áudio muito curto — mínimo 30 segundos recomendado</p>}
          <button type="button" onClick={stop} style={btnStatic("#22C55E")} aria-label="Parar gravação">
            Parar
          </button>
        </>
      )}
    </div>
  );
}

function TextFlow({
  itemId,
  initialText,
  minHint,
  patchItemState,
  uploadEvidence,
}: {
  itemId: string;
  initialText: string;
  minHint: number;
  patchItemState: (id: string, b: Record<string, unknown>) => Promise<boolean>;
  uploadEvidence: (id: string, f: File) => Promise<boolean>;
}) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialText.trim().length > 0);

  const save = async () => {
    setSaving(true);
    const trimmed = text.trim();
    const okPatch = await patchItemState(itemId, { status: "done", text: trimmed });
    if (!okPatch) {
      alert("Erro ao salvar texto.");
      setSaving(false);
      return;
    }
    const up = await uploadEvidence(itemId, new File([trimmed], "descricao.txt", { type: "text/plain" }));
    if (up) setSaved(true);
    else alert("Erro no upload do arquivo de texto.");
    setSaving(false);
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={e => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={6}
        placeholder="Descreva o imóvel: estado aparente, acesso, segurança percebida…"
        aria-label="Descrição textual da vistoria"
        style={{
          width: "100%",
          background: "#1A1A24",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: 12,
          color: "#F0F0F5",
          fontSize: 14,
          resize: "vertical",
        }}
      />
      <p style={{ fontSize: 12, color: text.length >= minHint ? "#22C55E" : "#F59E0B", marginBottom: 12 }}>
        {text.length}/{minHint} caracteres (recomendado mín. {minHint})
      </p>
      <button
        type="button"
        onClick={save}
        disabled={saving || !text.trim()}
        style={{
          background: "#7C6AF7",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "14px 0",
          width: "100%",
          fontSize: 16,
          fontWeight: 600,
          cursor: text.trim() ? "pointer" : "default",
          opacity: text.trim() ? 1 : 0.5,
        }}
        aria-label="Salvar descrição"
      >
        {saving ? "Salvando…" : saved ? "✅ Salvo — editar acima" : "Salvar descrição"}
      </button>
    </div>
  );
}

function SkipScreen({
  item,
  profile,
  onSkip,
  onCancel,
}: {
  item: MissionItem;
  profile: Profile;
  onSkip: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const finalReason = reason === "Outro (descrever abaixo)" ? custom : reason;

  return (
    <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Pular: {item.label}</h2>
      {profile.skipPenalty && (
        <p style={{ color: "#F59E0B", fontSize: 14, marginBottom: 16 }}>
          ⚠️ Você perderá R$ {((item.baseValue + item.bonusValue) / 100).toFixed(2)} ao pular este item
        </p>
      )}
      <p style={{ color: "#8B8B9E", fontSize: 14, marginBottom: 12 }}>Motivo:</p>
      {profile.skipReasons.map(r => (
        <label key={r} style={{ display: "block", padding: "8px 0", fontSize: 14, cursor: "pointer" }}>
          <input type="radio" name="skip" value={r} checked={reason === r} onChange={() => setReason(r)} style={{ marginRight: 8 }} />
          {r}
        </label>
      ))}
      {reason.includes("Outro") && (
        <textarea
          value={custom}
          onChange={e => setCustom(e.target.value)}
          rows={3}
          placeholder="Descreva o motivo…"
          aria-label="Motivo personalizado"
          style={{
            width: "100%",
            background: "#1A1A24",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: 12,
            color: "#F0F0F5",
            fontSize: 14,
            marginTop: 8,
          }}
        />
      )}
      {profile.skipRequiresText && finalReason.length < profile.skipMinChars && (
        <p style={{ fontSize: 12, color: "#E84040", marginTop: 8 }}>Mínimo {profile.skipMinChars} caracteres</p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: "#333", color: "#fff", border: "none", borderRadius: 8, padding: 14, cursor: "pointer" }}>
          Voltar
        </button>
        <button
          type="button"
          onClick={() => onSkip(finalReason)}
          disabled={!finalReason || (profile.skipRequiresText && finalReason.length < profile.skipMinChars)}
          style={{
            flex: 1,
            background: "#F59E0B",
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Confirmar skip
        </button>
      </div>
    </div>
  );
}
