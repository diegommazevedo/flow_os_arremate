"use client";

/**
 * FlowOS v4 — Filtros da lista de chats
 * Tags carregam ao montar (não só ao abrir o painel).
 */

import { useState, useEffect } from "react";
import type { Conversation } from "../_lib/chat-queries";

interface Tag         { id: string; descricao: string; corFundo: string; corTexto: string }
interface Department  { id: string; nome: string }
interface Integration { id: string; name: string; type: string }

export interface Filters {
  nome:           string;
  numero:         string;
  aparelhoId:     string;
  tagIds:         string[];
  tagMode:        "any" | "all" | "none";
  departamentoId: string;
  status:         string;
  sort:           "recent" | "oldest" | "unread" | "created";
  soNaoLidas:     boolean;
  soArquivadas:   boolean;
  soFavoritas:    boolean;
}

export const DEFAULT_FILTERS: Filters = {
  nome:           "",
  numero:         "",
  aparelhoId:     "",
  tagIds:         [],
  tagMode:        "any",
  departamentoId: "",
  status:         "",
  sort:           "recent",
  soNaoLidas:     false,
  soArquivadas:   false,
  soFavoritas:    false,
};

export function applyFilters(convs: Conversation[], f: Filters): Conversation[] {
  let result = [...convs];

  if (f.nome)
    result = result.filter(c => c.contactName.toLowerCase().includes(f.nome.toLowerCase()));
  if (f.numero)
    result = result.filter(c => c.contactPhone?.includes(f.numero));
  if (f.status)
    result = result.filter(c => c.status === f.status);
  if (f.soNaoLidas)
    result = result.filter(c => c.unreadCount > 0);
  if (f.soArquivadas)
    result = result.filter(c => c.arquivado);
  else
    result = result.filter(c => !c.arquivado);
  if (f.soFavoritas)
    result = result.filter(c => c.favorito);
  if (f.departamentoId)
    result = result.filter(c => c.departamentoId === f.departamentoId);

  switch (f.sort) {
    case "oldest":  result.sort((a, b) => a.lastAt - b.lastAt); break;
    case "unread":  result.sort((a, b) => (b.unreadCount - a.unreadCount) || (b.lastAt - a.lastAt)); break;
    case "created": result.sort((a, b) => a.lastAt - b.lastAt); break;
    default:        result.sort((a, b) => b.lastAt - a.lastAt); break;
  }

  return result;
}

const STATUS_OPTIONS = [
  { value: "",               label: "Todos" },
  { value: "ABERTO",         label: "Aberto" },
  { value: "EM_ATENDIMENTO", label: "Em Atendimento" },
  { value: "AGUARDANDO",     label: "Aguardando" },
  { value: "RESOLVIDO",      label: "Resolvido" },
  { value: "FECHADO",        label: "Fechado" },
];

const SORT_OPTIONS = [
  { value: "recent",  label: "Última msg" },
  { value: "oldest",  label: "Mais antigas" },
  { value: "unread",  label: "Não lidas" },
  { value: "created", label: "Criação" },
];

interface Props {
  filters:    Filters;
  onChange:   (f: Filters) => void;
  totalShown: number;
}

export function ChatFilters({ filters, onChange, totalShown }: Props) {
  const [open,    setOpen]    = useState(false);
  const [tags,    setTags]    = useState<Tag[]>([]);
  const [depts,   setDepts]   = useState<Department[]>([]);
  const [integrs, setIntegrs] = useState<Integration[]>([]);

  // Tags carregam ao montar — sempre visíveis
  useEffect(() => {
    void fetch("/api/tags")
      .then(r => r.ok ? r.json() : { tags: [] })
      .then((d: { tags?: Tag[] }) => setTags(d.tags ?? []));
  }, []);

  // Depts e integrations só ao abrir o painel avançado
  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/departamentos")
        .then(r => r.ok ? r.json() : { departamentos: [] })
        .then((d: { departamentos?: Department[] }) => setDepts(d.departamentos ?? [])),
      fetch("/api/integrations/list")
        .then(r => r.ok ? r.json() : { integrations: [] })
        .then((d: { integrations?: Integration[] }) =>
          setIntegrs((d.integrations ?? []).filter(i => i.type.includes("WHATSAPP"))),
        ),
    ]);
  }, [open]);

  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    onChange({ ...filters, [key]: val });

  const toggleTag = (id: string) => {
    const next = filters.tagIds.includes(id)
      ? filters.tagIds.filter(t => t !== id)
      : [...filters.tagIds, id];
    set("tagIds", next);
  };

  const hasActive = !!(
    filters.nome || filters.numero || filters.status ||
    filters.aparelhoId || filters.departamentoId || filters.tagIds.length > 0 ||
    filters.soNaoLidas || filters.soArquivadas || filters.soFavoritas
  );

  return (
    <div className="border-b border-gray-800">
      {/* Quick-filter bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 flex-wrap">
        <QuickBtn active={filters.soNaoLidas} onClick={() => set("soNaoLidas", !filters.soNaoLidas)}>
          🔴 Não lidas
        </QuickBtn>
        <QuickBtn active={filters.soArquivadas} onClick={() => set("soArquivadas", !filters.soArquivadas)}>
          📦 Arq.
        </QuickBtn>
        <QuickBtn active={filters.soFavoritas} onClick={() => set("soFavoritas", !filters.soFavoritas)}>
          ⭐ Fav.
        </QuickBtn>
        <button
          onClick={() => setOpen(o => !o)}
          className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium transition-colors border flex items-center gap-1
            ${(open || hasActive)
              ? "bg-indigo-900/40 text-indigo-300 border-indigo-700"
              : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500"}`}
        >
          ⚙{hasActive && " •"}
        </button>
      </div>

      {/* Tags always visible (colored pills) */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {tags.map(tag => {
            const active = filters.tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                style={active
                  ? { backgroundColor: tag.corFundo, color: tag.corTexto, borderColor: tag.corFundo }
                  : { borderColor: `${tag.corFundo}80`, color: tag.corFundo }
                }
                className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all border
                  ${active ? "ring-1 ring-offset-1 ring-offset-gray-900" : "bg-transparent hover:opacity-80"}`}
              >
                {tag.descricao}
              </button>
            );
          })}
        </div>
      )}

      {/* Advanced filter panel */}
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-gray-500 block">
              Nome
              <input
                value={filters.nome}
                onChange={e => set("nome", e.target.value)}
                placeholder="Filtrar nome…"
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-indigo-600 placeholder:text-gray-600"
              />
            </label>
            <label className="text-[10px] text-gray-500 block">
              Número
              <input
                value={filters.numero}
                onChange={e => set("numero", e.target.value)}
                placeholder="Filtrar tel…"
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-indigo-600 placeholder:text-gray-600"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-gray-500 block">
              Status
              <select
                value={filters.status}
                onChange={e => set("status", e.target.value)}
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-indigo-600"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-gray-500 block">
              Ordenar
              <select
                value={filters.sort}
                onChange={e => set("sort", e.target.value as Filters["sort"])}
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-indigo-600"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {integrs.length > 1 && (
            <label className="text-[10px] text-gray-500 block">
              Aparelho
              <select
                value={filters.aparelhoId}
                onChange={e => set("aparelhoId", e.target.value)}
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-indigo-600"
              >
                <option value="">Todos</option>
                {integrs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
          )}

          {depts.length > 0 && (
            <label className="text-[10px] text-gray-500 block">
              Departamento
              <select
                value={filters.departamentoId}
                onChange={e => set("departamentoId", e.target.value)}
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-indigo-600"
              >
                <option value="">Todos</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </label>
          )}

          {tags.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">Modo de tag</span>
                <select
                  value={filters.tagMode}
                  onChange={e => set("tagMode", e.target.value as Filters["tagMode"])}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] text-gray-400 focus:outline-none"
                >
                  <option value="any">Qualquer</option>
                  <option value="all">Todas</option>
                  <option value="none">Não tem</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-gray-500">Exibindo {totalShown}</span>
            {hasActive && (
              <button
                onClick={() => onChange(DEFAULT_FILTERS)}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Limpar ✕
              </button>
            )}
          </div>
        </div>
      )}

      {!open && (
        <div className="px-3 pb-1.5 text-[10px] text-gray-600">
          {totalShown} conversa{totalShown !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function QuickBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border
        ${active
          ? "bg-indigo-900/40 text-indigo-300 border-indigo-700"
          : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500"}`}
    >
      {children}
    </button>
  );
}
