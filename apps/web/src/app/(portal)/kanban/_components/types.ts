// Tipos compartilhados entre KanbanBoard e KanbanCard

export type KanbanStatus =
  | "inbox"
  | "em_progresso"
  | "aguardando_cliente"
  | "aguardando_externo"
  | "concluido";

export type EisenhowerQ = "Q1" | "Q2" | "Q3" | "Q4";

export type ChannelBadge = "WA" | "EM" | "CH" | "RC" | "SM";

export interface KanbanDeal {
  id: string;
  arrematante: string;
  city: string;
  uf: string;
  value: number;
  currentPhase: string;
  phaseColor: string;     // hex bg color
  status: KanbanStatus;
  quadrant: EisenhowerQ;
  slaDeadlineMs: number;  // epoch ms
  channels: ChannelBadge[];
  assignee?: { name: string; color: string; initials: string } | null;
  isCritical?: boolean;
}

export interface FilterState {
  ufs: string[];
  phases: string[];
  assignees: string[];
}

export interface SSEMessage {
  type: "DEAL_UPDATE" | "HEARTBEAT";
  dealId?: string;
  patch?: Partial<KanbanDeal>;
  timestamp: number;
}
