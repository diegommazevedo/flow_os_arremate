export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { getSessionWorkspaceId } from "@/lib/session";
import { sseBus, type KanbanSSEEvent } from "@/lib/sse-bus";

/**
 * SSE endpoint â€” Kanban board real-time.
 *
 * [SEC-03] AUTENTICAÃ‡ÃƒO OBRIGATÃ“RIA:
 *   workspaceId lido exclusivamente da sessÃ£o Supabase autenticada.
 *   Sem sessÃ£o vÃ¡lida â†’ 401 imediato, sem stream.
 *
 * Fontes de eventos:
 *  1. Heartbeat interno (10s) â€” mantÃ©m conexÃ£o viva
 *  2. Mock periÃ³dico (30s) â€” simula mudanÃ§a de status
 *  3. sseBus 'kanban:update' â€” publicado pelo webhook /api/webhooks/rocket e outros
 */

export async function GET(request: Request) {
  // [SEC-03] workspaceId APENAS da sessÃ£o â€” nunca do request
  const workspaceId = await getSessionWorkspaceId();

  if (!workspaceId) {
    return new Response(null, { status: 401 });
  }

  const encoder = new TextEncoder();

  let heartbeatId: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (eventName: string, data: unknown) => {
        try {
          const line =
            eventName === "message"
              ? `data: ${JSON.stringify(data)}\n\n`
              : `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          // stream jÃ¡ fechado â€” ignora silenciosamente
        }
      };

      enqueue("connected", { ok: true, ts: Date.now() });

      heartbeatId = setInterval(() => {
        enqueue("message", { type: "HEARTBEAT", timestamp: Date.now() });
      }, 10_000);

      const busListener = (event: KanbanSSEEvent) => {
        enqueue("message", event);
      };
      sseBus.on("kanban:update", busListener);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatId);
        sseBus.off("kanban:update", busListener);
        try { controller.close(); } catch { /* jÃ¡ fechado */ }
      });
    },

    cancel() {
      clearInterval(heartbeatId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream; charset=utf-8",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
