"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export interface CampaignRow {
  id: string;
  name: string;
  type: string;
  status: string;
  totalLeads: number;
  dossierReady: number;
  progressPct: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  campaign: CampaignRow;
  /** Botões mais densos (tabela / kanban compacto) */
  compact?: boolean;
  onRefresh: () => void;
}

export function CampaignActions({ campaign: c, compact, onRefresh }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"patch" | "delete" | "restart" | "dispatch" | null>(null);

  const btn = compact
    ? "rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight"
    : "rounded border px-2 py-0.5 text-xs font-medium";

  const patchCampaign = useCallback(
    async (payload: { status?: string; action?: string }) => {
      if (payload.status === "CANCELLED" && !window.confirm("Confirmar cancelamento?")) return;
      if (payload.action === "archive" && !window.confirm("Arquivar esta campanha?")) return;
      setBusy("patch");
      try {
        const r = await fetch(`/api/campaigns/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        let d: { error?: string } = {};
        try {
          d = (await r.json()) as { error?: string };
        } catch {
          d = {};
        }
        if (!r.ok) {
          window.alert(d.error ?? "Erro ao atualizar campanha");
          return;
        }
        onRefresh();
      } finally {
        setBusy(null);
      }
    },
    [c.id, onRefresh],
  );

  const deleteCampaign = useCallback(async () => {
    if (
      !window.confirm(
        `Excluir campanha "${c.name}" permanentemente? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const r = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
      let d: { error?: string } = {};
      try {
        d = (await r.json()) as { error?: string };
      } catch {
        d = {};
      }
      if (!r.ok) {
        window.alert(d.error ?? "Erro ao excluir campanha");
        return;
      }
      onRefresh();
    } finally {
      setBusy(null);
    }
  }, [c.id, c.name, onRefresh]);

  const handleRestart = useCallback(async () => {
    if (!window.confirm("Reenviar campanha? Items pendentes serão reprocessados.")) return;
    setBusy("restart");
    try {
      const r = await fetch(`/api/campaigns/${c.id}/restart`, { method: "POST" });
      let d: { error?: string } = {};
      try {
        d = (await r.json()) as { error?: string };
      } catch {
        d = {};
      }
      if (!r.ok) {
        window.alert(d.error ?? "Erro ao reenviar campanha");
        return;
      }
      onRefresh();
    } finally {
      setBusy(null);
    }
  }, [c.id, onRefresh]);

  const handleDispatchAll = useCallback(async () => {
    if (
      !window.confirm(
        "Disparar todos os items pendentes? Motoboys serão acionados via WhatsApp.",
      )
    ) {
      return;
    }
    setBusy("dispatch");
    try {
      const r = await fetch(`/api/campaigns/${c.id}/dispatch-all`, { method: "POST" });
      let d: { error?: string } = {};
      try {
        d = (await r.json()) as { error?: string };
      } catch {
        d = {};
      }
      if (!r.ok) {
        window.alert(d.error ?? "Erro ao disparar campanha");
        return;
      }
      onRefresh();
    } finally {
      setBusy(null);
    }
  }, [c.id, onRefresh]);

  const patching = busy === "patch" || busy === "delete";
  const restarting = busy === "restart";
  const dispatching = busy === "dispatch";

  const canPause = c.status === "RUNNING";
  const canResume = c.status === "PAUSED";
  const canCancel = c.status === "DRAFT" || c.status === "RUNNING" || c.status === "PAUSED";
  const canRestart = ["DRAFT", "PAUSED", "RUNNING"].includes(c.status);
  const canDispatch = c.status === "RUNNING";
  const canArchive = ["COMPLETED", "CANCELLED"].includes(c.status) && !c.archivedAt;
  const canUnarchive = !!c.archivedAt;
  const canDelete = !!c.archivedAt || ["CANCELLED", "DRAFT"].includes(c.status);

  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
      <button
        type="button"
        className={btn}
        style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
        disabled={!!busy}
        onClick={() => router.push(`/campanhas/${c.id}`)}
      >
        Monitor
      </button>
      {canDispatch && (
        <button
          type="button"
          className={btn}
          style={{ borderColor: "var(--border-default)", color: "var(--text-accent)" }}
          disabled={!!busy}
          onClick={() => void handleDispatchAll()}
        >
          {dispatching ? "…" : "⚡ Disparar"}
        </button>
      )}
      {canPause && (
        <button
          type="button"
          className={btn}
          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
          disabled={patching}
          onClick={() => void patchCampaign({ status: "PAUSED" })}
        >
          Pausar
        </button>
      )}
      {canResume && (
        <button
          type="button"
          className={btn}
          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
          disabled={patching}
          onClick={() => void patchCampaign({ status: "RUNNING" })}
        >
          Retomar
        </button>
      )}
      {canRestart && (
        <button
          type="button"
          className={btn}
          style={{ borderColor: "var(--border-default)", color: "var(--text-accent)" }}
          disabled={!!busy}
          onClick={() => void handleRestart()}
        >
          {restarting ? "…" : "↺ Reenviar"}
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          className={`${btn} text-red-600`}
          style={{ borderColor: "var(--border-default)" }}
          disabled={patching}
          onClick={() => void patchCampaign({ status: "CANCELLED" })}
        >
          Cancelar
        </button>
      )}
      {canArchive && (
        <button
          type="button"
          className={btn}
          style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}
          disabled={patching}
          onClick={() => void patchCampaign({ action: "archive" })}
        >
          Arquivar
        </button>
      )}
      {canUnarchive && (
        <button
          type="button"
          className={btn}
          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
          disabled={patching}
          onClick={() => void patchCampaign({ action: "unarchive" })}
        >
          Desarquivar
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className={`${btn} text-red-500`}
          style={{ borderColor: "var(--border-default)" }}
          disabled={patching}
          onClick={() => void deleteCampaign()}
        >
          Excluir
        </button>
      )}
    </div>
  );
}
