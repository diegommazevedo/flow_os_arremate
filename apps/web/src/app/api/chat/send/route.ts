/**
 * POST /api/chat/send
 *
 * Envia mensagem ao cliente via RC ou WhatsApp.
 * [SEC-03] Requer sessao autenticada.
 * [SEC-06] Registra no AuditLog.
 * [SEC-05] Body validado com Zod.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProtocolChannel, db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";

const MEDIA_KIND = {
  image: "IMAGE",
  audio: "AUDIO",
  video: "VIDEO",
  document: "DOCUMENT",
} as const;

const SendBodySchema = z
  .object({
    taskId: z.string().optional(),
    dealId: z.string().min(1),
    text: z.string().max(4096).optional().default(""),
    channel: z.enum(["RC", "WA"]),
    roomId: z.string().optional(),
    phone: z.string().optional(),
    media: z
      .object({
        type: z.enum(["image", "audio", "video", "document"]),
        url: z.string().min(1).max(2048),
        caption: z.string().max(1024).optional(),
        fileName: z.string().max(255).optional(),
        mimeType: z.string().max(127).optional(),
      })
      .optional(),
  })
  .superRefine((d, ctx) => {
    const t = (d.text ?? "").trim();
    if (!t && !d.media) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "text ou media obrigatorio",
        path: ["text"],
      });
    }
  });

async function resolveAuditAgentId(workspaceId: string): Promise<string | null> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return agent?.id ?? null;
}

async function sendRocketChat(roomId: string, text: string): Promise<void> {
  const url = process.env["ROCKET_API_URL"];
  const userId = process.env["ROCKET_BOT_USER_ID"];
  const token = process.env["ROCKET_BOT_TOKEN"];

  if (!url || !userId || !token) {
    throw new Error("ROCKET_API_URL / ROCKET_BOT_USER_ID / ROCKET_BOT_TOKEN nao configurados");
  }

  const res = await fetch(`${url}/api/v1/chat.postMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
      "X-User-Id": userId,
    },
    body: JSON.stringify({ roomId, text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Rocket.Chat error ${res.status}: ${err}`);
  }
}

export async function POST(request: NextRequest) {
  const workspaceId = (await getSessionContext())?.workspaceId ?? null;
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawJson: unknown;
  try {
    rawJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = SendBodySchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacao falhou", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { taskId, dealId, text, channel, roomId, phone, media } = parsed.data;
  const textTrimmed = text.trim();
  const captionForMedia = (media?.caption ?? textTrimmed).slice(0, 1024);

  const startMs = Date.now();
  let success = true;
  let error: string | undefined;

  try {
    if (channel === "RC") {
      if (media) throw new Error("Envio de midia nao suportado no Rocket.Chat por esta rota");
      if (!roomId) throw new Error("roomId obrigatorio para canal RC");
      await sendRocketChat(roomId, textTrimmed);
    } else if (channel === "WA") {
      if (!phone) throw new Error("phone obrigatorio para canal WA");

      const [{ evolutionApi }, { whatsAppMeta }] = await Promise.all([
        import("@flow-os/brain/providers/evolution-api"),
        import("@flow-os/brain/providers/whatsapp-meta"),
      ]);

      const chatSession = taskId
        ? await db.chatSession.findFirst({
            where: { taskId, workspaceId },
            select: { aparelhoOrigem: true },
          })
        : null;

      let integration = chatSession?.aparelhoOrigem
        ? await db.workspaceIntegration.findFirst({
            where: {
              workspaceId,
              status: "ACTIVE",
              OR: [
                { config: { path: ["META_PHONE_NUMBER_ID"], equals: chatSession.aparelhoOrigem } },
                { config: { path: ["phoneNumberId"], equals: chatSession.aparelhoOrigem } },
                { config: { path: ["EVOLUTION_INSTANCE_NAME"], equals: chatSession.aparelhoOrigem } },
                { config: { path: ["instanceName"], equals: chatSession.aparelhoOrigem } },
              ],
            },
            select: { type: true, config: true },
          })
        : null;

      if (!integration) {
        integration =
          (await db.workspaceIntegration.findFirst({
            where: { workspaceId, status: "ACTIVE", type: "WHATSAPP_EVOLUTION" },
            select: { type: true, config: true },
          })) ??
          (await db.workspaceIntegration.findFirst({
            where: { workspaceId, status: "ACTIVE", type: "WHATSAPP_META" },
            select: { type: true, config: true },
          }));
      }

      if (integration?.type === "WHATSAPP_EVOLUTION") {
        const config = (integration.config ?? {}) as Record<string, string>;
        const instanceName = config["EVOLUTION_INSTANCE_NAME"] ?? config["instanceName"] ?? "";
        if (!instanceName) throw new Error("Instancia Evolution nao configurada");
        if (media) {
          await evolutionApi.sendMedia(
            instanceName,
            phone,
            media.url,
            media.type,
            captionForMedia,
            workspaceId,
            media.fileName,
            media.mimeType,
          );
        } else {
          await evolutionApi.sendText(instanceName, phone, textTrimmed, workspaceId);
        }
      } else {
        if (media) throw new Error("Envio de midia via Meta Cloud API nao implementado nesta rota");
        const result = await whatsAppMeta.sendText(phone, textTrimmed, workspaceId);
        if (!result.ok) {
          throw new Error(result.error ?? "WhatsApp send failed");
        }
      }
    } else {
      throw new Error(`Canal nao suportado: ${channel}`);
    }

    if (taskId) {
      const protocol = await db.protocol.findFirst({
        where: { workspaceId, taskId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });

      if (protocol) {
        const conteudo = media
          ? JSON.stringify({
              kind: "media",
              mediaKind: MEDIA_KIND[media.type],
              url: media.url,
              caption: captionForMedia || null,
              fileName: media.fileName ?? null,
            })
          : defaultSanitizer.clean(textTrimmed);
        await db.protocolMessage.create({
          data: {
            workspaceId,
            protocolId: protocol.id,
            direction: "OUT",
            canal: channel === "RC" ? ProtocolChannel.INTERNO : ProtocolChannel.WHATSAPP,
            conteudo,
            autorId: "chat_send",
          },
        });
      }
    }
  } catch (e) {
    success = false;
    error = e instanceof Error ? e.message : String(e);
  }

  const auditAgentId = await resolveAuditAgentId(workspaceId);
  if (auditAgentId) {
    try {
      const outMedia = media
        ? {
            media: {
              kind: MEDIA_KIND[media.type],
              url: media.url,
              ...(media.fileName ? { fileName: media.fileName } : {}),
            },
          }
        : {};

      await db.agentAuditLog.create({
        data: {
          workspaceId,
          agentId: auditAgentId,
          action: `chat_send_${channel.toLowerCase()}`,
          input: { taskId, dealId, channel, roomId, phone: phone ? "***" : undefined },
          output: {
            text: (media ? captionForMedia : textTrimmed).slice(0, 200),
            success,
            ...outMedia,
          },
          modelUsed: "none",
          tokensUsed: 0,
          costUsd: 0,
          durationMs: Date.now() - startMs,
          success,
          ...(error ? { error } : {}),
        },
      });
    } catch (auditErr) {
      console.error("[api/chat/send] agentAuditLog.create failed", auditErr);
    }
  }

  if (!success) {
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentAt: Date.now() });
}
