/**
 * POST /api/chat/new
 *
 * Inicia uma nova conversa WA manualmente via Evolution API.
 *
 * [SEC-03] workspaceId da sessão
 * [SEC-06] AuditLog de envio
 * [SEC-08] .clean() em textos
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { decrypt } from "@/lib/encrypt";
import { ensureInstanceOpen, normalizeInstancesPayload } from "@/lib/evolution";

const Body = z.object({
  phone:          z.string().min(8).max(20),
  name:           z.string().min(1).max(120).optional(),
  message:        z.string().min(1).max(4096),
  instanceName:   z.string().optional(),
});

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

interface EvolutionCtx {
  apiUrl: string;
  apiKey: string;
  /** Instância preferida (integração ou env), se houver */
  configInstance: string | undefined;
}

async function loadEvolutionCtx(workspaceId: string): Promise<EvolutionCtx> {
  const integration = await db.workspaceIntegration.findFirst({
    where:   { workspaceId, type: "WHATSAPP_EVOLUTION", status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  if (integration) {
    const config = (integration.config ?? {}) as Record<string, string>;
    const apiUrl = config["apiUrl"] || process.env["EVOLUTION_API_URL"] || "http://localhost:8080";
    const apiKey = config["apiKey"] ? decrypt(config["apiKey"]) : (process.env["EVOLUTION_API_KEY"] ?? "");
    const inst = config["instanceName"] ?? config["EVOLUTION_INSTANCE_NAME"] ?? "";
    return {
      apiUrl,
      apiKey,
      configInstance: inst.length > 0 ? inst : undefined,
    };
  }

  const envInst = process.env["EVOLUTION_INSTANCE_NAME"];
  return {
    apiUrl: process.env["EVOLUTION_API_URL"] ?? "http://localhost:8080",
    apiKey: process.env["EVOLUTION_API_KEY"] ?? "",
    configInstance: envInst && envInst.length > 0 ? envInst : undefined,
  };
}

async function connectionState(
  apiUrl: string,
  apiKey: string,
  instance: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      signal:  AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { instance?: { state?: string }; state?: string };
    return data.instance?.state ?? data.state ?? null;
  } catch {
    return null;
  }
}

/** Primeira instância em estado `open` via fetchInstances; null se falhar ou vazio. */
async function tryFetchOpenInstance(apiUrl: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${apiUrl}/instance/fetchInstances`, {
    headers: { apikey: apiKey },
    signal:  AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const raw  = await res.json() as unknown;
  const list = normalizeInstancesPayload(raw);
  const open = list.find(i => i.state === "open");
  return open?.instanceName ?? null;
}

async function resolveInstanceName(
  explicit: string | undefined,
  ctx: EvolutionCtx,
): Promise<string> {
  if (explicit?.trim()) return explicit.trim();

  if (!ctx.apiKey) {
    throw new Error(
      "API Key da Evolution não configurada. Defina em Integrações (WhatsApp Evolution) ou EVOLUTION_API_KEY no ambiente.",
    );
  }

  // 1) Instância salva na integração + connectionState
  if (ctx.configInstance) {
    const st = await connectionState(ctx.apiUrl, ctx.apiKey, ctx.configInstance);
    if (st === "open") return ctx.configInstance;
  }

  // 2) Listar instâncias (vários formatos de resposta)
  const fromList = await tryFetchOpenInstance(ctx.apiUrl, ctx.apiKey);
  if (fromList) return fromList;

  // 3) Tentar nomes comuns em dev
  for (const guess of [
    ctx.configInstance,
    "arrematador_01",
    "arrematador-01",
    "arrematador-02",
  ].filter(Boolean) as string[]) {
    const st = await connectionState(ctx.apiUrl, ctx.apiKey, guess);
    if (st === "open") return guess;
  }

  throw new Error(
    "Nenhuma instância WhatsApp em estado conectado (open). Verifique a Evolution em localhost:8080 e a API Key.",
  );
}

async function sendViaEvolution(
  apiUrl: string,
  apiKey: string,
  phone: string,
  text: string,
  instance: string,
): Promise<void> {
  const number = `${phone}@s.whatsapp.net`;

  const res = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number,
      text,
      options: { delay: 1200, presence: "composing" },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution API ${res.status}: ${err.slice(0, 200)}`);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctxSession = await getSessionContext();
  if (!ctxSession) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId } = ctxSession;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos", detail: String(e) }, { status: 400 });
  }

  const phone   = normalizePhone(body.phone);
  const safeMsg = defaultSanitizer.clean(body.message);
  const name    = body.name ? defaultSanitizer.clean(body.name) : `+${phone}`;

  try {
    const evoCtx = await loadEvolutionCtx(workspaceId);

    let contact = await db.contact.findFirst({
      where: { workspaceId, phone },
    });
    if (!contact) {
      contact = await db.contact.create({
        data: { workspaceId, phone, name, type: "PERSON" },
      });
    }

    const stage = await db.stage.findFirst({
      where:   { workspaceId },
      orderBy: { position: "asc" },
    });
    if (!stage) {
      throw new Error("Configure pelo menos um estágio no workspace antes de criar conversas.");
    }

    let deal = await db.deal.findFirst({
      where:   { workspaceId, contactId: contact.id },
      orderBy: { createdAt: "desc" },
    });
    if (!deal) {
      deal = await db.deal.create({
        data: {
          workspaceId,
          stageId:   stage.id,
          title:     `Conversa WA — ${name}`,
          contactId: contact.id,
          meta:      {
            eisenhower:   "Q2_PLAN",
            kanbanStatus: "INBOX",
            channel:      "WA",
          },
        },
      });
    }

    const instance = await resolveInstanceName(body.instanceName, evoCtx);
    await ensureInstanceOpen(instance, { baseUrl: evoCtx.apiUrl, apiKey: evoCtx.apiKey });
    await sendViaEvolution(evoCtx.apiUrl, evoCtx.apiKey, phone, safeMsg, instance);

    const task = await db.task.create({
      data: {
        workspaceId,
        dealId:      deal.id,
        title:       safeMsg.slice(0, 100),
        quadrant:    "Q2_PLAN",
        channel:     "WA",
        description: JSON.stringify({
          channel:       "WA",
          phone,
          name,
          rawText:       safeMsg,
          actorId:       contact.id,
          instanceName:  instance,
        }),
      },
    });

    const agent = await db.agent.findFirst({
      where: { workspaceId },
      select: { id: true },
    });
    if (agent) {
      await db.agentAuditLog.create({
        data: {
          workspaceId,
          agentId:    agent.id,
          action:     "whatsapp_send_text",
          input:      { phone, name, taskId: task.id, dealId: deal.id, channel: "WA" },
          output:     { text: safeMsg.slice(0, 200) },
          modelUsed:  "none",
          tokensUsed: 0,
          costUsd:    0,
          durationMs: 0,
          success:    true,
        },
      });
    }

    return NextResponse.json({
      taskId:  task.id,
      dealId:  deal.id,
      actorId: contact.id,
      phone,
      name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
