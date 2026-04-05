"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { KanbanCard, KanbanCardOverlay } from "./KanbanCard";
import type {
  KanbanDeal,
  KanbanStatus,
  EisenhowerQ,
  FilterState,
  SSEMessage,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// §1  CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS: { id: KanbanStatus; label: string }[] = [
  { id: "inbox",               label: "Inbox" },
  { id: "em_progresso",        label: "Em Progresso" },
  { id: "aguardando_cliente",  label: "Ag. Cliente" },
  { id: "aguardando_externo",  label: "Ag. Externo" },
  { id: "concluido",           label: "Concluído" },
];

interface SwimlaneConfig {
  id: EisenhowerQ;
  label: string;
  sublabel: string;
  wipLimit: number;
  borderLeft: string;   // Tailwind class
  bg: string;           // Tailwind class
  headerTextColor: string;
  collapsibleDefault?: boolean;
}

const SWIMLANES: SwimlaneConfig[] = [
  {
    id: "Q1",
    label: "Q1",
    sublabel: "Faça Agora",
    wipLimit: 3,
    borderLeft: "border-l-[3px] border-l-red-500",
    bg: "bg-red-500/5",
    headerTextColor: "text-red-400",
  },
  {
    id: "Q2",
    label: "Q2",
    sublabel: "Agende",
    wipLimit: 8,
    borderLeft: "border-l-[3px] border-l-blue-500",
    bg: "bg-blue-500/5",
    headerTextColor: "text-blue-400",
  },
  {
    id: "Q3",
    label: "Q3",
    sublabel: "Delegue",
    wipLimit: 10,
    borderLeft: "border-l-[3px] border-l-amber-500",
    bg: "bg-amber-500/5",
    headerTextColor: "text-amber-400",
  },
  {
    id: "Q4",
    label: "Q4",
    sublabel: "Elimine",
    wipLimit: 999,
    borderLeft: "border-l border-l-gray-700",
    bg: "bg-gray-900/20",
    headerTextColor: "text-gray-500",
    collapsibleDefault: true,
  },
];

// §2 — Mock data removido. Dados reais via prop initialDeals (Server Component).

// ─────────────────────────────────────────────────────────────────────────────
// §3  SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Droppable cell ──────────────────────────────────────────────────────────

interface DroppableCellProps {
  id: string;
  children: React.ReactNode;
  isEmpty: boolean;
  quadrant: EisenhowerQ;
}

function DroppableCell({ id, children, isEmpty, quadrant }: DroppableCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const overStyle = isOver
    ? "ring-1 ring-inset ring-white/20 bg-white/5"
    : "";

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[80px] rounded-md p-1.5 space-y-1.5 transition-colors ${overStyle}`}
      data-quadrant={quadrant}
    >
      {isEmpty && !isOver && (
        <div className="h-10 border border-dashed border-gray-800 rounded-md flex items-center justify-center">
          <span className="text-[10px] text-gray-700">—</span>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Swimlane header ──────────────────────────────────────────────────────────

interface SwimlaneHeaderProps {
  config: SwimlaneConfig;
  wipCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
}

function SwimlaneHeader({ config, wipCount, isCollapsed, onToggle }: SwimlaneHeaderProps) {
  const atLimit = wipCount >= config.wipLimit;

  return (
    <button
      onClick={onToggle}
      className={[
        "w-36 flex-shrink-0 rounded-lg border border-gray-800 p-2.5 text-left",
        "hover:border-gray-700 transition-colors",
        config.bg,
        config.borderLeft,
      ].join(" ")}
    >
      <div className={`text-sm font-bold ${config.headerTextColor}`}>
        {config.label}
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">{config.sublabel}</div>
      <div className="mt-2 flex items-center gap-1">
        <span
          className={[
            "text-[10px] font-mono px-1.5 py-0.5 rounded border",
            atLimit
              ? "bg-red-900/40 text-red-400 border-red-800"
              : "bg-gray-800 text-gray-400 border-gray-700",
          ].join(" ")}
        >
          {wipCount}
          {config.wipLimit < 999 ? `/${config.wipLimit}` : ""}
          {atLimit && " ★"}
        </span>
        <span className="text-gray-700 text-[10px]">
          {isCollapsed ? "▶" : "▼"}
        </span>
      </div>
    </button>
  );
}

// ── Column header row ─────────────────────────────────────────────────────────

function ColumnHeaderRow() {
  return (
    <div className="flex gap-2 mb-2 sticky top-0 z-10 bg-gray-950 pb-1.5">
      {/* Spacer for swimlane header */}
      <div className="w-36 flex-shrink-0" />
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          className="flex-1 px-2 py-1.5 rounded-md bg-gray-900 border border-gray-800"
        >
          <span className="text-xs font-medium text-gray-400">{col.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  dealId: string;
  fromQ: EisenhowerQ;
  toQ: EisenhowerQ;
  toLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ fromQ, toQ, toLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const qConfig = SWIMLANES.find((s) => s.id === toQ)!;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-80 shadow-2xl">
        <h3 className="text-sm font-semibold text-white mb-1">
          Reclassificar quadrante?
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Mover de{" "}
          <span className="font-medium text-gray-200">{fromQ}</span> para{" "}
          <span className={`font-medium ${qConfig.headerTextColor}`}>
            {toQ} — {toLabel}
          </span>
          . Esta ação altera a prioridade Eisenhower do deal.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 text-xs py-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 text-xs py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors font-medium"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filters bar ───────────────────────────────────────────────────────────────

interface FiltersBarProps {
  deals: KanbanDeal[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
  sseConnected: boolean;
}

function FiltersBar({ deals, filters, onChange, sseConnected }: FiltersBarProps) {
  const allUfs     = [...new Set(deals.map((d) => d.uf))].sort();
  const allPhases  = [...new Set(deals.map((d) => d.currentPhase))].sort();
  const allAssignees = [...new Set(deals.map((d) => d.assignee?.name).filter(Boolean) as string[])].sort();

  const toggle = (key: keyof FilterState, val: string) => {
    const prev = filters[key];
    onChange({
      ...filters,
      [key]: prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    });
  };

  const clearAll = () => onChange({ ufs: [], phases: [], assignees: [] });
  const hasActive =
    filters.ufs.length > 0 || filters.phases.length > 0 || filters.assignees.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* UF filter */}
      <FilterDropdown
        label="UF"
        options={allUfs}
        selected={filters.ufs}
        onToggle={(v) => toggle("ufs", v)}
      />
      {/* Phase filter */}
      <FilterDropdown
        label="Fase"
        options={allPhases}
        selected={filters.phases}
        onToggle={(v) => toggle("phases", v)}
      />
      {/* Assignee filter */}
      <FilterDropdown
        label="Assignee"
        options={allAssignees}
        selected={filters.assignees}
        onToggle={(v) => toggle("assignees", v)}
      />
      {hasActive && (
        <button
          onClick={clearAll}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
        >
          Limpar filtros
        </button>
      )}

      {/* SSE indicator */}
      <div className="ml-auto flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            sseConnected ? "bg-green-400 animate-pulse" : "bg-gray-600"
          }`}
        />
        <span className="text-[10px] text-gray-600">
          {sseConnected ? "Live" : "Offline"}
        </span>
      </div>
    </div>
  );
}

interface FilterDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
}

function FilterDropdown({ label, options, selected, onToggle }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
          selected.length > 0
            ? "border-brand-600 bg-brand-600/10 text-brand-400"
            : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600",
        ].join(" ")}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-brand-600 text-white rounded-full text-[9px] w-4 h-4 flex items-center justify-center font-bold">
            {selected.length}
          </span>
        )}
        <span className="text-gray-600">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors text-left"
            >
              <span
                className={`w-3 h-3 rounded-sm border flex-shrink-0 ${
                  selected.includes(opt)
                    ? "bg-brand-600 border-brand-600"
                    : "border-gray-600"
                }`}
              />
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mobile accordion ──────────────────────────────────────────────────────────

interface MobileAccordionProps {
  deals: KanbanDeal[];
}

function MobileAccordion({ deals }: MobileAccordionProps) {
  const [openQ, setOpenQ] = useState<EisenhowerQ[]>(["Q1", "Q2"]);

  const toggle = (q: EisenhowerQ) => {
    setOpenQ((prev) =>
      prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q],
    );
  };

  return (
    <div className="space-y-2 md:hidden">
      {SWIMLANES.map((sw) => {
        const swDeals = deals.filter((d) => d.quadrant === sw.id);
        const isOpen  = openQ.includes(sw.id);

        return (
          <div
            key={sw.id}
            className={`rounded-lg border border-gray-800 overflow-hidden ${sw.borderLeft}`}
          >
            {/* Accordion header */}
            <button
              onClick={() => toggle(sw.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 ${sw.bg}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${sw.headerTextColor}`}>
                  {sw.label}
                </span>
                <span className="text-xs text-gray-500">{sw.sublabel}</span>
                <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                  {swDeals.length}
                </span>
              </div>
              <span className="text-gray-600 text-xs">{isOpen ? "▼" : "▶"}</span>
            </button>

            {/* Cards list */}
            {isOpen && (
              <div className="p-2 space-y-2">
                {swDeals.length === 0 ? (
                  <p className="text-xs text-gray-700 text-center py-3">
                    Nenhum deal neste quadrante
                  </p>
                ) : (
                  swDeals.map((deal) => (
                    <div key={deal.id} className="relative">
                      <div className="absolute left-0 top-0 bottom-0 flex items-center">
                        <span className="text-[9px] text-gray-600 -rotate-90 whitespace-nowrap origin-left translate-x-1 translate-y-8">
                          {COLUMNS.find((c) => c.id === deal.status)?.label}
                        </span>
                      </div>
                      <div className="ml-4">
                        <KanbanCard deal={deal} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  MODAL — NOVO DEAL
// ─────────────────────────────────────────────────────────────────────────────

type Modalidade = "FINANCIAMENTO" | "A_VISTA" | "LICITACAO_ABERTA";

function NewDealModal({
  onClose,
  onCreated,
}: {
  onClose:   () => void;
  onCreated: (d: KanbanDeal) => void;
}) {
  const [arrematante, setArrematante] = useState("");
  const [phone,       setPhone]       = useState("");
  const [endereco,    setEndereco]    = useState("");
  const [uf,          setUf]          = useState("SP");
  const [value,       setValue]       = useState("");
  const [modalidade,  setModalidade]  = useState<Modalidade>("FINANCIAMENTO");
  const [error,       setError]       = useState("");
  const [pending,     setPending]     = useState(false);

  const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
  const MODALIDADES: { value: Modalidade; label: string }[] = [
    { value: "FINANCIAMENTO",    label: "Financiamento" },
    { value: "A_VISTA",          label: "À Vista" },
    { value: "LICITACAO_ABERTA", label: "Licitação Aberta" },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!arrematante.trim()) { setError("Nome do comprador é obrigatório."); return; }
    if (!endereco.trim())    { setError("Endereço é obrigatório."); return; }
    const numericValue = parseFloat(value.replace(/\D/g, "")) || 0;
    if (numericValue <= 0) { setError("Informe um valor válido."); return; }

    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/deals/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          arrematante: arrematante.trim(),
          phone:       phone || undefined,
          endereco:    endereco.trim(),
          uf,
          value:       numericValue,
          modalidade,
        }),
      });

      if (res.ok) {
        const { deal } = await res.json() as { deal: { id: string; value: number } };
        // Constrói um KanbanDeal mínimo para mostrar imediatamente no board
        const now = Date.now();
        const newDeal: KanbanDeal = {
          id:           deal.id,
          arrematante:  arrematante.trim(),
          value:        deal.value,
          quadrant:     "Q2",
          status:       "inbox",
          slaDeadlineMs: now + 5 * 86_400_000,
          currentPhase: "Captação",
          phaseColor:   "#374151",
          isCritical:   false,
          uf,
          city:         "",
          channels:     ["WA"],
        };
        onCreated(newDeal);
        onClose();
      } else {
        const { error: msg } = await res.json().catch(() => ({ error: "Erro ao criar deal." })) as { error: string };
        setError(msg);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
          <h2 className="text-white font-semibold">Novo Imóvel</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nome do comprador *</label>
            <input
              autoFocus
              value={arrematante}
              onChange={(e) => setArrematante(e.target.value)}
              placeholder="Nome completo"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">WhatsApp</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-0000"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Endereço do imóvel *</label>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número — Bairro, Cidade"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">UF</label>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valor (R$) *</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="350000"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Modalidade</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {MODALIDADES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModalidade(m.value)}
                  className={`flex-1 py-2 text-xs transition-colors ${
                    modalidade === m.value
                      ? "bg-brand-600 text-white"
                      : "bg-gray-900 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              {pending ? "Criando…" : "Criar Imóvel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  BOARD PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

interface DragPending {
  dealId: string;
  fromQ: EisenhowerQ;
  toQ: EisenhowerQ;
  toStatus: KanbanStatus;
  toLabel: string;
}

interface KanbanBoardProps {
  initialDeals: KanbanDeal[];
}

export function KanbanBoard({ initialDeals }: KanbanBoardProps) {
  const [deals, setDeals]         = useState<KanbanDeal[]>(initialDeals);
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [dragPending, setDragPending] = useState<DragPending | null>(null);
  const [filters, setFilters]     = useState<FilterState>({ ufs: [], phases: [], assignees: [] });
  const [sseConnected, setSseConnected] = useState(false);
  const [collapsedQ, setCollapsedQ] = useState<Record<EisenhowerQ, boolean>>({
    Q1: false, Q2: false, Q3: false, Q4: true,
  });
  const [showNewDeal, setShowNewDeal] = useState(false);

  // ── SSE connection ─────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/sse/kanban");

    es.addEventListener("connected", () => setSseConnected(true));
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as SSEMessage;
        if (msg.type === "DEAL_UPDATE" && msg.dealId && msg.patch) {
          setDeals((prev) =>
            prev.map((d) =>
              d.id === msg.dealId ? { ...d, ...msg.patch } : d,
            ),
          );
        }
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => setSseConnected(false);

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, []);

  // ── DnD sensors ────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // ── Derived state ──────────────────────────────────────────────────────
  const filteredDeals = deals.filter((d) => {
    if (filters.ufs.length > 0 && !filters.ufs.includes(d.uf)) return false;
    if (filters.phases.length > 0 && !filters.phases.includes(d.currentPhase)) return false;
    if (filters.assignees.length > 0 && !filters.assignees.includes(d.assignee?.name ?? "")) return false;
    return true;
  });

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;

  // ── WIP counts ─────────────────────────────────────────────────────────
  const wipCounts: Record<EisenhowerQ, number> = {
    Q1: filteredDeals.filter((d) => d.quadrant === "Q1").length,
    Q2: filteredDeals.filter((d) => d.quadrant === "Q2").length,
    Q3: filteredDeals.filter((d) => d.quadrant === "Q3").length,
    Q4: filteredDeals.filter((d) => d.quadrant === "Q4").length,
  };

  // ── DnD handlers ───────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const deal = deals.find((d) => d.id === active.id);
    if (!deal) return;

    // Container ID format: "Q1-inbox"
    const [targetQ, ...statusParts] = String(over.id).split("-");
    const targetStatus = statusParts.join("-") as KanbanStatus;
    const targetQuadrant = targetQ as EisenhowerQ;

    if (!targetStatus || !targetQuadrant) return;
    if (targetQuadrant === deal.quadrant && targetStatus === deal.status) return;

    if (targetQuadrant !== deal.quadrant) {
      // Cross-swimlane: require confirmation
      const sw = SWIMLANES.find((s) => s.id === targetQuadrant);
      setDragPending({
        dealId:    deal.id,
        fromQ:     deal.quadrant,
        toQ:       targetQuadrant,
        toStatus:  targetStatus,
        toLabel:   sw?.sublabel ?? targetQuadrant,
      });
    } else {
      // Same swimlane: move freely
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id ? { ...d, status: targetStatus } : d,
        ),
      );
    }
  }

  function confirmReclassify() {
    if (!dragPending) return;
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dragPending.dealId
          ? { ...d, quadrant: dragPending.toQ, status: dragPending.toStatus }
          : d,
      ),
    );
    setDragPending(null);
  }

  function toggleQ(q: EisenhowerQ) {
    setCollapsedQ((prev) => ({ ...prev, [q]: !prev[q] }));
  }

  // ── Stats for header ───────────────────────────────────────────────────
  const q1Count = filteredDeals.filter((d) => d.quadrant === "Q1").length;
  const criticalCount = filteredDeals.filter((d) => d.isCritical).length;
  const slaBreachCount = filteredDeals.filter(
    (d) => d.slaDeadlineMs < Date.now() + 2 * 3_600_000,
  ).length;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-3 h-full flex flex-col">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-white">Kanban</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Arrematador Caixa · {filteredDeals.length} deals ativos
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {criticalCount > 0 && (
              <span className="text-xs px-2 py-1 rounded-lg bg-red-900/30 text-red-400 border border-red-800 font-medium">
                ★ {criticalCount} crítico{criticalCount > 1 ? "s" : ""}
              </span>
            )}
            {slaBreachCount > 0 && (
              <span className="text-xs px-2 py-1 rounded-lg bg-amber-900/30 text-amber-400 border border-amber-800">
                ⚠ {slaBreachCount} SLA &lt; 2h
              </span>
            )}
            {q1Count > 0 && (
              <span className="text-xs px-2 py-1 rounded-lg bg-red-950/60 text-red-300 border border-red-900">
                Q1: {q1Count}/3 WIP
              </span>
            )}
            <button
              onClick={() => setShowNewDeal(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors font-medium"
            >
              + Novo Imóvel
            </button>
          </div>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0">
          <FiltersBar
            deals={deals}
            filters={filters}
            onChange={setFilters}
            sseConnected={sseConnected}
          />
        </div>

        {/* ── Mobile accordion ────────────────────────────────────────── */}
        <MobileAccordion deals={filteredDeals} />

        {/* ── Desktop board ─────────────────────────────────────────────
            hidden on mobile, visible on md+ */}
        <div className="hidden md:block flex-1 overflow-auto">
          <div className="min-w-[960px] pb-4">
            <ColumnHeaderRow />

            {SWIMLANES.map((sw) => {
              const isCollapsed = collapsedQ[sw.id];
              const swDeals = filteredDeals.filter((d) => d.quadrant === sw.id);
              const wip = wipCounts[sw.id];

              return (
                <div key={sw.id} className="flex gap-2 mb-2">
                  {/* Swimlane header */}
                  <SwimlaneHeader
                    config={sw}
                    wipCount={wip}
                    isCollapsed={isCollapsed}
                    onToggle={() => toggleQ(sw.id)}
                  />

                  {/* Q4 collapsed: single message row */}
                  {isCollapsed ? (
                    <div
                      className={[
                        "flex-1 rounded-lg border border-gray-800/50 flex items-center px-4 py-2",
                        sw.bg,
                        sw.borderLeft,
                      ].join(" ")}
                    >
                      <span className="text-xs text-gray-600">
                        {swDeals.length} deals ocultos · clique em{" "}
                        <span className={sw.headerTextColor}>{sw.label}</span> para expandir
                      </span>
                    </div>
                  ) : (
                    /* Column cells */
                    COLUMNS.map((col) => {
                      const cellId = `${sw.id}-${col.id}`;
                      const cellDeals = swDeals.filter((d) => d.status === col.id);

                      return (
                        <DroppableCell
                          key={cellId}
                          id={cellId}
                          isEmpty={cellDeals.length === 0}
                          quadrant={sw.id}
                        >
                          {cellDeals.map((deal) => (
                            <KanbanCard key={deal.id} deal={deal} />
                          ))}
                        </DroppableCell>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Drag overlay ──────────────────────────────────────────────── */}
        <DragOverlay dropAnimation={null}>
          {activeDeal ? <KanbanCardOverlay deal={activeDeal} /> : null}
        </DragOverlay>
      </div>

      {/* ── Confirm reclassify dialog ──────────────────────────────────── */}
      {dragPending && (
        <ConfirmDialog
          dealId={dragPending.dealId}
          fromQ={dragPending.fromQ}
          toQ={dragPending.toQ}
          toLabel={dragPending.toLabel}
          onConfirm={confirmReclassify}
          onCancel={() => setDragPending(null)}
        />
      )}

      {/* ── New deal modal ────────────────────────────────────────────────── */}
      {showNewDeal && (
        <NewDealModal
          onClose={() => setShowNewDeal(false)}
          onCreated={(d) => setDeals((prev) => [d, ...prev])}
        />
      )}
    </DndContext>
  );
}

