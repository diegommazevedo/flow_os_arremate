/**
 * SSE Bus — barramento de eventos em memória compartilhado entre
 * route handlers no mesmo processo Node.js.
 *
 * O webhook POST publica aqui; o GET /api/sse/kanban subscribe e forwarda
 * ao cliente browser via text/event-stream.
 *
 * Em produção distribuída: substituir por Redis Pub/Sub ou Supabase Realtime.
 */

import { EventEmitter } from "node:events";

export interface KanbanSSEEvent {
  type:       "TASK_CREATED" | "TASK_UPDATED" | "DEAL_UPDATE" | "NEW_MESSAGE" | "GATE_B_UPDATE" | "HEARTBEAT";
  taskId?:    string;
  dealId?:    string | null;
  quadrant?:  string;
  channel?:   string;
  patch?:     Record<string, unknown>;
  timestamp:  number;
}

export interface InternalSSEEvent {
  type: "MESSAGE_CREATED" | "Q1_ALERT" | "PROTOCOL_UPDATED" | "HEARTBEAT";
  workspaceId: string;
  channelId?: string;
  protocolId?: string;
  dealId?: string | null;
  payload?: Record<string, unknown>;
  timestamp: number;
}

// Singleton via globalThis — sobrevive ao hot-reload do Next.js dev
const g = globalThis as typeof globalThis & { _sseBus?: EventEmitter };

if (!g._sseBus) {
  g._sseBus = new EventEmitter();
  g._sseBus.setMaxListeners(200); // suporta até 200 clientes SSE simultâneos
}

export const sseBus = g._sseBus;

/** Publica um evento para todos os clientes SSE conectados */
export function publishKanbanEvent(event: KanbanSSEEvent): void {
  sseBus.emit("kanban:update", event);
}

export function publishInternalEvent(event: InternalSSEEvent): void {
  sseBus.emit("interno:update", event);
}
