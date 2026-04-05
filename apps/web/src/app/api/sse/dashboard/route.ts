/**
 * SSE endpoint â€” Dashboard real-time.
 *
 * [SEC-03] AUTENTICAÃ‡ÃƒO OBRIGATÃ“RIA:
 *   workspaceId Ã© lido EXCLUSIVAMENTE da sessÃ£o Supabase autenticada.
 *   Jamais do query string, body ou qualquer parÃ¢metro do request.
 *   Sem sessÃ£o vÃ¡lida â†’ 401 imediato, sem stream.
 *
 * PadrÃ£o de eventos:
 *   event: connected   â€” confirmaÃ§Ã£o de conexÃ£o
 *   event: metrics     â€” DashboardMetrics completo (30s interval)
 *   data:  HEARTBEAT   â€” mantÃ©m conexÃ£o viva (10s interval)
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { getSessionWorkspaceId } from "@/lib/session";
import { getDashboardMetrics } from "@/app/(portal)/dashboard/_lib/dashboard-queries";

export async function GET(request: Request) {
  // [SEC-03] workspaceId APENAS da sessÃ£o â€” nunca do request
  const workspaceId = await getSessionWorkspaceId();

  if (!workspaceId) {
    return new Response(null, { status: 401 });
  }

  const encoder = new TextEncoder();

  let heartbeatTimer: ReturnType<typeof setInterval>;
  let metricsTimer:   ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (eventName: string, data: unknown) => {
        try {
          const chunk =
            eventName === "message"
              ? `data: ${JSON.stringify(data)}\n\n`
              : `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream jÃ¡ fechado â€” silencioso
        }
      };

      enqueue("connected", { ok: true, ts: Date.now() });

      try {
        const metrics = await getDashboardMetrics(workspaceId);
        enqueue("metrics", metrics);
      } catch {
        enqueue("error", { message: "Falha ao carregar mÃ©tricas", ts: Date.now() });
      }

      heartbeatTimer = setInterval(() => {
        enqueue("message", { type: "HEARTBEAT", timestamp: Date.now() });
      }, 10_000);

      metricsTimer = setInterval(async () => {
        try {
          const metrics = await getDashboardMetrics(workspaceId);
          enqueue("metrics", metrics);
        } catch {
          enqueue("message", { type: "METRICS_ERROR", timestamp: Date.now() });
        }
      }, 30_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatTimer);
        clearInterval(metricsTimer);
        try { controller.close(); } catch { /* jÃ¡ fechado */ }
      });
    },

    cancel() {
      clearInterval(heartbeatTimer);
      clearInterval(metricsTimer);
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
