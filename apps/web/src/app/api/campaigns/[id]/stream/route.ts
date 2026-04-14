/**
 * GET /api/campaigns/[id]/stream — SSE com snapshot periódico (10s).
 * [SEC-03] workspaceId da sessão.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getSessionWorkspaceId } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id: campaignId } = await params;

  const enc = new TextEncoder();
  const { signal } = req;

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (signal.aborted) return;
        try {
          const origin = req.nextUrl.origin;
          const cookie = req.headers.get("cookie") ?? "";
          const res = await fetch(`${origin}/api/campaigns/${campaignId}`, {
            headers: { cookie },
            cache: "no-store",
          });
          const json = await res.json().catch(() => ({}));
          controller.enqueue(enc.encode(`data: ${JSON.stringify(json)}\n\n`));
        } catch {
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify({ error: "snapshot_failed" })}\n\n`),
          );
        }
      };

      await send();
      const iv = setInterval(() => {
        void send();
      }, 10_000);

      const onAbort = () => {
        clearInterval(iv);
        controller.close();
      };
      signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
