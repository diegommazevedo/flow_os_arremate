"use client";

/**
 * FlowOS v4 — Sidebar do chat (5 abas)
 * Aba 1: Informações · Aba 2: Histórico · Aba 3: Notas · Aba 4: Deal · Aba 5: Arquivos
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { PIPELINE_STAGES } from "@flow-os/templates";
import type { Conversation } from "../_lib/chat-queries";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Member      { id: string; userId: string; role: string }
interface Department  { id: string; nome: string }
interface Tag         { id: string; descricao: string; corFundo: string; corTexto: string }
interface Nota        { id: string; conteudo: string; autorId: string; pinned: boolean; visivelNoBot: boolean; createdAt: string }
interface HistEntry   { id: string; status: string; autorId: string | null; ts: number }
interface DocItem     { id: string; name: string; url: string; createdAt: string }

// [P-01] labels gerados dinamicamente do template — sem termos setoriais hardcoded
const PHASE_LABELS: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map(s => [s.id, s.label]),
);

// ─── Sub-componentes utilitários ──────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-8 bg-gray-800 rounded-lg" />
      ))}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
      <span className="text-[10px] text-gray-500 w-28 shrink-0 pt-0.5 uppercase tracking-wide">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Toggle({
  value, onChange, disabled,
}: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors
        ${value ? "bg-indigo-600" : "bg-gray-700"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform
        ${value ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

// ─── Aba 1: Informações ───────────────────────────────────────────────────────

function TabInfo({
  conv,
  onUpdate,
}: {
  conv: Conversation;
  onUpdate: (patch: Partial<Conversation>) => void;
}) {
  const [members,   setMembers]   = useState<Member[]>([]);
  const [depts,     setDepts]     = useState<Department[]>([]);
  const [tags,      setTags]      = useState<Tag[]>([]);
  const [selTags,   setSelTags]   = useState<string[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [customMeta, setCustomMeta] = useState<Record<string, string>>({});

  useEffect(() => {
    void Promise.all([
      fetch("/api/members").then(r => r.ok ? r.json() : { members: [] }).then((d: { members?: Member[] }) => setMembers(d.members ?? [])),
      fetch("/api/departamentos").then(r => r.ok ? r.json() : { departamentos: [] }).then((d: { departamentos?: Department[] }) => setDepts(d.departamentos ?? [])),
      fetch("/api/tags").then(r => r.ok ? r.json() : { tags: [] }).then((d: { tags?: Tag[] }) => setTags(d.tags ?? [])),
    ]);
  }, []);

  useEffect(() => {
    if (!conv.contactId) return;
    fetch(`/api/contacts/${conv.contactId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { contact?: { meta?: Record<string, string> } } | null) => {
        if (d?.contact?.meta) setCustomMeta(d.contact.meta);
      })
      .catch(() => null);
  }, [conv.contactId]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`/api/chat/${conv.id}/info`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      onUpdate(body as Partial<Conversation>);
    } finally {
      setSaving(false);
    }
  };

  const patchContact = async (meta: Record<string, string>) => {
    if (!conv.contactId) return;
    await fetch(`/api/contacts/${conv.contactId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ meta }),
    });
    setCustomMeta(meta);
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/chat?task=${conv.id}`);
  };

  const toggleTag = (tagId: string) => {
    const next = selTags.includes(tagId)
      ? selTags.filter(t => t !== tagId)
      : [...selTags, tagId];
    setSelTags(next);
    void patch({ tags: next });
  };

  const CUSTOM_FIELDS: Array<{ key: string; label: string }> = [
    { key: "investimentoOuUso",   label: "Investimento ou uso?" },
    { key: "creditoAprovado",     label: "Crédito aprovado?" },
    { key: "linkDrive",           label: "Link do Drive" },
    { key: "recursoDisponivel",   label: "Recurso disponível?" },
    { key: "formaPagamento",      label: "Forma de pagamento" },
    { key: "jaArrematou",         label: "Já fez operação?" },
  ];

  return (
    <div className="p-3 space-y-1 text-xs">
      {/* Contato */}
      <FieldRow label="Nome">
        {conv.contactId ? (
          <Link href={`/contacts/${conv.contactId}`} className="text-indigo-400 hover:underline font-medium">
            {conv.contactName}
          </Link>
        ) : (
          <span className="text-gray-300">{conv.contactName}</span>
        )}
      </FieldRow>
      <FieldRow label="WhatsApp">
        <span className="text-gray-300 font-mono">{conv.contactPhone ?? "—"}</span>
      </FieldRow>
      <FieldRow label="Aparelho">
        <span className="text-gray-400 text-[10px] font-mono">{conv.channel}</span>
      </FieldRow>

      {/* Toggles */}
      <FieldRow label="Chatbot">
        <Toggle
          value={conv.chatbotAtivo}
          disabled={saving}
          onChange={v => void patch({ chatbotAtivo: v })}
        />
      </FieldRow>
      <FieldRow label="Arquivado">
        <Toggle
          value={conv.arquivado}
          disabled={saving}
          onChange={v => void patch({ arquivado: v })}
        />
      </FieldRow>
      <FieldRow label="Favorito">
        <button
          onClick={() => void patch({ favorito: !conv.favorito })}
          className={`text-base ${conv.favorito ? "text-yellow-400" : "text-gray-600"}`}
          title="Favoritar"
        >
          ★
        </button>
      </FieldRow>

      {/* Responsável */}
      <FieldRow label="Responsável">
        <select
          value={conv.responsavelId ?? ""}
          onChange={e => void patch({ responsavelId: e.target.value || null })}
          disabled={saving}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 text-[11px] focus:outline-none focus:border-indigo-600"
        >
          <option value="">— Nenhum —</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.userId.slice(0, 8)}… ({m.role})</option>
          ))}
        </select>
      </FieldRow>

      {/* Departamento */}
      <FieldRow label="Departamento">
        <select
          value={conv.departamentoId ?? ""}
          onChange={e => void patch({ departamentoId: e.target.value || null })}
          disabled={saving}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 text-[11px] focus:outline-none focus:border-indigo-600"
        >
          <option value="">— Nenhum —</option>
          {depts.map(d => (
            <option key={d.id} value={d.id}>{d.nome}</option>
          ))}
        </select>
      </FieldRow>

      {/* Delegar */}
      {conv.departamentoId && (
        <div className="pt-1">
          <button
            onClick={() => void fetch(`/api/chat/${conv.id}/delegar`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ departamentoId: conv.departamentoId }),
            })}
            className="w-full py-1.5 rounded bg-indigo-900/40 border border-indigo-700/50 text-indigo-300 text-[11px] hover:bg-indigo-800/50 transition-colors"
          >
            Delegar p/ Fila →
          </button>
        </div>
      )}

      {/* Tags */}
      <div className="pt-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Tags</p>
        <div className="flex flex-wrap gap-1">
          {tags.map(tag => {
            const active = selTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                style={active ? { backgroundColor: tag.corFundo, color: tag.corTexto } : {}}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border
                  ${active ? "border-transparent" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}
              >
                {tag.descricao}
              </button>
            );
          })}
          {tags.length === 0 && (
            <span className="text-gray-600 text-[10px]">Nenhuma tag cadastrada</span>
          )}
        </div>
      </div>

      {/* Campos personalizados */}
      <div className="pt-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Campos personalizados</p>
        <div className="space-y-1">
          {CUSTOM_FIELDS.map(f => (
            <FieldRow key={f.key} label={f.label}>
              <input
                value={customMeta[f.key] ?? ""}
                onChange={e => setCustomMeta(prev => ({ ...prev, [f.key]: e.target.value }))}
                onBlur={() => void patchContact(customMeta)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 text-[11px] focus:outline-none focus:border-indigo-600"
              />
            </FieldRow>
          ))}
        </div>
      </div>

      {/* Rodapé */}
      <div className="pt-3 flex items-center justify-between text-[10px] text-gray-600">
        <span>Cadastro: {new Date(conv.lastAt).toLocaleDateString("pt-BR")}</span>
        <button onClick={copyLink} className="hover:text-gray-400 transition-colors">
          Copiar link 🔗
        </button>
      </div>
    </div>
  );
}

// ─── Aba 2: Histórico ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ABERTO:         "Aberto",
  EM_ATENDIMENTO: "Em Atendimento",
  AGUARDANDO:     "Aguardando",
  RESOLVIDO:      "Resolvido",
  FECHADO:        "Fechado",
  INDEFINIDO:     "Indefinido",
};

const STATUS_COLOR: Record<string, string> = {
  ABERTO:         "bg-red-900/40 text-red-300 border-red-800",
  EM_ATENDIMENTO: "bg-green-900/40 text-green-300 border-green-800",
  AGUARDANDO:     "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  RESOLVIDO:      "bg-blue-900/40 text-blue-300 border-blue-800",
  FECHADO:        "bg-gray-800 text-gray-400 border-gray-700",
  INDEFINIDO:     "bg-gray-800/50 text-gray-500 border-gray-700",
};

function TabHistorico({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<HistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/chat/${taskId}/historico`)
      .then(r => r.ok ? r.json() : { historico: [] })
      .then((d: { historico?: HistEntry[] }) => setEntries(d.historico ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <div className="p-3"><SectionSkeleton /></div>;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-xs">
        <span className="text-2xl mb-1">📋</span>
        Sem histórico registrado
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">
        {entries.length} eventos registrados
      </p>
      {entries.map((e, i) => {
        const durMs = i < entries.length - 1 ? (entries[i + 1]!.ts - e.ts) : null;
        const durLabel = durMs === null ? null
          : durMs < 60_000   ? `${Math.round(durMs / 1000)}s`
          : durMs < 3_600_000 ? `${Math.round(durMs / 60_000)}min`
          : `${Math.round(durMs / 3_600_000)}h`;

        const statusKey = e.status.replace("chat.session.", "").replace(".update", "").toUpperCase();
        const label = STATUS_LABEL[statusKey] ?? e.status;
        const colorClass = STATUS_COLOR[statusKey] ?? STATUS_COLOR["INDEFINIDO"]!;

        return (
          <div key={e.id} className="flex items-start gap-2 text-xs">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-gray-600 mt-1 shrink-0" />
              {i < entries.length - 1 && <div className="w-px flex-1 bg-gray-800 my-0.5" />}
            </div>
            <div className="flex-1 pb-2">
              <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${colorClass}`}>
                {label}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-gray-500 text-[10px]">
                  {new Date(e.ts).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                </span>
                {durLabel && (
                  <span className="text-gray-600 text-[10px]">duração: {durLabel}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba 3: Notas ─────────────────────────────────────────────────────────────

function TabNotas({ taskId }: { taskId: string }) {
  const [notas,    setNotas]   = useState<Nota[]>([]);
  const [loading,  setLoading] = useState(true);
  const [search,   setSearch]  = useState("");
  const [newText,  setNewText] = useState("");
  const [pinned,   setPinned]  = useState(false);
  const [visBot,   setVisBot]  = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [page,     setPage]    = useState(0);
  const PER_PAGE = 20;

  const load = () => {
    setLoading(true);
    fetch(`/api/chat/${taskId}/notas`)
      .then(r => r.ok ? r.json() : { notas: [] })
      .then((d: { notas?: Nota[] }) => setNotas(d.notas ?? []))
      .catch(() => setNotas([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [taskId]);

  const submit = async () => {
    if (!newText.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/chat/${taskId}/notas`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ conteudo: newText.trim(), pinned, visivelNoBot: visBot }),
      });
      if (r.ok) {
        const d = await r.json() as { nota?: Nota };
        if (d.nota) setNotas(prev => [d.nota!, ...prev]);
        setNewText("");
        setPinned(false);
        setVisBot(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const filtered = notas.filter(n =>
    !search || n.conteudo.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-800 space-y-2">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar notas…"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-indigo-600 placeholder:text-gray-600"
        />
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          rows={2}
          placeholder="Nova anotação interna…"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 resize-none focus:outline-none focus:border-indigo-600 placeholder:text-gray-600"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="accent-indigo-500" />
              📌 Fixar
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={visBot} onChange={e => setVisBot(e.target.checked)} className="accent-indigo-500" />
              🤖 Visível ao bot
            </label>
          </div>
          <button
            onClick={() => void submit()}
            disabled={!newText.trim() || saving}
            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-medium transition-colors"
          >
            {saving ? "…" : "+ Anotação"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? <SectionSkeleton /> : paged.length === 0 ? (
          <div className="text-center text-gray-600 text-xs py-6">
            {search ? "Nenhuma nota encontrada" : "Sem anotações ainda"}
          </div>
        ) : paged.map(nota => (
          <div key={nota.id} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-2.5 space-y-1">
            <p className="text-xs text-gray-200 leading-relaxed">{nota.conteudo}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {nota.pinned && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-300 border border-yellow-800/50">
                  📌 Fixada
                </span>
              )}
              {nota.visivelNoBot && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-800/50">
                  🤖 Visível ao bot
                </span>
              )}
              <span className="text-[9px] text-gray-600 ml-auto">
                {new Date(nota.createdAt).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length > PER_PAGE && (
        <div className="border-t border-gray-800 p-2 flex items-center justify-between text-[10px] text-gray-500">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="disabled:opacity-40">
            ← Anterior
          </button>
          <span>{page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, filtered.length)} / {filtered.length}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PER_PAGE >= filtered.length} className="disabled:opacity-40">
            Próximo →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Aba 4: Deal ──────────────────────────────────────────────────────────────

function TabDeal({ conv }: { conv: Conversation }) {
  const [dealMeta, setDealMeta] = useState<Record<string, unknown>>({});
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!conv.dealId) return;
    fetch(`/api/deals/${conv.dealId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { deal?: { meta?: Record<string, unknown> } } | null) => {
        if (d?.deal?.meta) setDealMeta(d.deal.meta);
      })
      .catch(() => null);
  }, [conv.dealId]);

  const currentPhase = String(dealMeta["currentPhase"] ?? dealMeta["phase"] ?? "—");
  const uf           = String(dealMeta["uf"] ?? "—");
  const modalidade   = String(dealMeta["modalidade"] ?? "—");
  const value        = dealMeta["value"] ? Number(dealMeta["value"]).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const condStatus   = String(dealMeta["condominioStatus"] ?? "—");
  const titleStatus  = String(dealMeta["title_status"] ?? "—");
  const titulStatus  = String(dealMeta["titularidadeStatus"] ?? "—");

  const phases = Object.keys(PHASE_LABELS);

  const advancePhase = async (phase: string) => {
    if (!conv.dealId || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/deals/${conv.dealId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ meta: { ...dealMeta, currentPhase: phase } }),
      });
      setDealMeta(prev => ({ ...prev, currentPhase: phase }));
    } finally {
      setSaving(false);
    }
  };

  if (!conv.dealId) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-600 text-xs">
        Sem deal vinculado
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Fase atual */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Fase atual</p>
        <span className="inline-block px-2 py-1 rounded-lg bg-indigo-900/40 border border-indigo-700/50 text-indigo-300 font-medium text-[11px]">
          {PHASE_LABELS[currentPhase] ?? currentPhase}
        </span>
      </div>

      {/* Avançar fase */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Avançar fase</p>
        <select
          value={currentPhase}
          onChange={e => void advancePhase(e.target.value)}
          disabled={saving}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 text-[11px] focus:outline-none focus:border-indigo-600"
        >
          {phases.map(p => (
            <option key={p} value={p}>{PHASE_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {/* Mini-resumo */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <FieldRow label="UF"><span className="text-gray-300">{uf}</span></FieldRow>
        <FieldRow label="Valor"><span className="text-gray-300">{value}</span></FieldRow>
        <FieldRow label="Modalidade"><span className="text-gray-300 truncate block">{modalidade}</span></FieldRow>
      </div>

      {/* Branches paralelas */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Branches paralelas</p>
        <div className="space-y-1">
          {[
            { label: "Condomínio",    val: condStatus  },
            { label: "Title status",  val: titleStatus },
            { label: "Titularidade",  val: titulStatus },
          ].map(b => (
            <div key={b.label} className="flex items-center justify-between">
              <span className="text-gray-500">{b.label}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium
                ${b.val === "CONCLUIDO" ? "bg-green-900/40 text-green-300"
                : b.val === "EM_TRATAMENTO" ? "bg-yellow-900/40 text-yellow-300"
                : "bg-gray-800 text-gray-500"}`}>
                {b.val}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Link
        href={`/deals/${conv.dealId}`}
        className="block text-center py-1.5 rounded border border-gray-700 text-gray-400 hover:border-indigo-700 hover:text-indigo-400 transition-colors text-[11px]"
      >
        Ver deal completo →
      </Link>
    </div>
  );
}

// ─── Aba 5: Arquivos ──────────────────────────────────────────────────────────

function TabArquivos({ conv }: { conv: Conversation }) {
  const [docs,       setDocs]    = useState<DocItem[]>([]);
  const [loading,    setLoading] = useState(true);
  const [activeTab,  setActiveTab] = useState<"midias" | "docs">("docs");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!conv.dealId) { setLoading(false); return; }
    fetch(`/api/deals/${conv.dealId}/documents`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then((d: { documents?: DocItem[] }) => setDocs(d.documents ?? []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [conv.dealId]);

  const upload = async (file: File) => {
    if (!conv.dealId || uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dealId", conv.dealId);
      fd.append("checklistItemId", `chat-upload-${Date.now()}`);
      const r = await fetch("/api/portal/upload-document", { method: "POST", body: fd });
      if (r.ok) {
        const d = await r.json() as { url?: string; documentId?: string };
        setDocs(prev => [
          { id: d.documentId ?? "new", name: file.name, url: d.url ?? "", createdAt: new Date().toISOString() },
          ...prev,
        ]);
      }
    } finally {
      setUploading(false);
    }
  };

  const isMedia = (name: string) => /\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i.test(name);

  const midias = docs.filter(d => isMedia(d.name));
  const docList = docs.filter(d => !isMedia(d.name));
  const visible = activeTab === "midias" ? midias : docList;

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex border-b border-gray-800">
        {(["docs", "midias"] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors
              ${activeTab === t ? "text-white border-b-2 border-indigo-500" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t === "docs" ? `Documentos (${docList.length})` : `Mídias (${midias.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {loading ? <SectionSkeleton /> : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-600 text-xs">
            <span className="text-2xl mb-1">📎</span>
            {activeTab === "midias" ? "Sem mídias" : "Sem documentos"}
          </div>
        ) : visible.map(doc => (
          <div key={doc.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 border border-gray-700/40 hover:border-gray-600 transition-colors group">
            <span className="text-lg shrink-0">{isMedia(doc.name) ? "🖼️" : "📄"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-300 truncate">{doc.name}</p>
              <p className="text-[9px] text-gray-600">
                {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all"
            >
              ↓
            </a>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div className="border-t border-gray-800 p-3">
        <input ref={fileRef} type="file" className="hidden" onChange={e => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !conv.dealId}
          className="w-full py-1.5 rounded border border-gray-700 text-gray-400 hover:border-indigo-700 hover:text-indigo-400 transition-colors text-[11px] disabled:opacity-40"
        >
          {uploading ? "Enviando…" : "+ Enviar arquivo"}
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const TABS = [
  { key: "info",      label: "Informações" },
  { key: "historico", label: "Histórico" },
  { key: "notas",     label: "Notas" },
  { key: "deal",      label: "Deal" },
  { key: "arquivos",  label: "Arquivos" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Props {
  conv:      Conversation;
  onClose:   () => void;
  onUpdate:  (patch: Partial<Conversation>) => void;
}

export function ChatSidebar({ conv, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<TabKey>("info");

  return (
    <div className="flex flex-col w-72 shrink-0 border-l border-gray-800 bg-gray-900/60 h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-300 truncate">{conv.contactName}</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-base leading-none ml-2">✕</button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-2.5 py-2 text-[10px] font-medium transition-colors whitespace-nowrap
              ${tab === t.key
                ? "text-white border-b-2 border-indigo-500"
                : "text-gray-500 hover:text-gray-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "info"      && <TabInfo conv={conv} onUpdate={onUpdate} />}
        {tab === "historico" && <TabHistorico taskId={conv.id} />}
        {tab === "notas"     && <TabNotas taskId={conv.id} />}
        {tab === "deal"      && <TabDeal conv={conv} />}
        {tab === "arquivos"  && <TabArquivos conv={conv} />}
      </div>
    </div>
  );
}
