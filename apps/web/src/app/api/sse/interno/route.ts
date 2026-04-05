export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getSessionContext } from "@/lib/session";
import { sseBus, type InternalSSEEvent } from "@/lib/sse-bus";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId") ?? undefined;
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
          // noop
        }
      };

      enqueue("connected", { ok: true, ts: Date.now() });

      heartbeatId = setInterval(() => {
        enqueue("message", {
          type: "HEARTBEAT",
          workspaceId: session.workspaceId,
          channelId,
          timestamp: Date.now(),
        });
      }, 10_000);

      const busListener = (event: InternalSSEEvent) => {
        if (event.workspaceId !== session.workspaceId) return;
        if (channelId && event.channelId && event.channelId !== channelId) return;
        enqueue("message", event);
      };

      sseBus.on("interno:update", busListener);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatId);
        sseBus.off("interno:update", busListener);
        try { controller.close(); } catch { /* noop */ }
      });
    },
    cancel() {
      clearInterval(heartbeatId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
