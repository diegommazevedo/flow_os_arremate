export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, type Prisma } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { encrypt } from "@/lib/encrypt";
import { normalizeEvolutionApiBaseUrl } from "@/lib/evolution";

const MetaSchema = z.object({
  type:               z.literal("WHATSAPP_META"),
  name:               z.string().min(1).max(120),
  accessToken:        z.string().min(1),
  phoneNumberId:      z.string().min(1),
  appSecret:          z.string().min(1),
  webhookVerifyToken: z.string().min(1),
  autoReply:          z.boolean().default(false),
});

/** Aceita host sem esquema; Zod `.url()` exige `https://` ou `http://`. */
const evolutionApiUrlSchema = z
  .string()
  .min(1)
  .transform((s) => {
    const t = s.trim();
    if (!/^https?:\/\//i.test(t)) return `https://${t}`;
    return t;
  })
  .pipe(z.string().url());

const EvolutionSchema = z.object({
  type:         z.literal("WHATSAPP_EVOLUTION"),
  name:         z.string().min(1).max(120),
  apiUrl:       evolutionApiUrlSchema,
  apiKey:       z.string().min(1),
  instanceName: z.string().min(1).max(80),
});

const Schema = z.discriminatedUnion("type", [MetaSchema, EvolutionSchema]);

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const name = defaultSanitizer.clean(parsed.data.name);

    // [SEC-02] Criptografar credenciais antes de persistir
    let config: Prisma.InputJsonObject;
    if (parsed.data.type === "WHATSAPP_META") {
      config = {
        accessToken: encrypt(parsed.data.accessToken),
        phoneNumberId: encrypt(parsed.data.phoneNumberId),
        appSecret: encrypt(parsed.data.appSecret),
        webhookVerifyToken: encrypt(parsed.data.webhookVerifyToken),
        autoReply: parsed.data.autoReply,
      };
    } else {
      const apiUrlNorm = normalizeEvolutionApiBaseUrl(defaultSanitizer.clean(parsed.data.apiUrl));
      const instNorm = defaultSanitizer.clean(parsed.data.instanceName).trim().toLowerCase();

      const siblings = await db.workspaceIntegration.findMany({
        where: {
          workspaceId: session.workspaceId,
          type: "WHATSAPP_EVOLUTION",
          status: "ACTIVE",
        },
        select: { id: true, config: true },
      });

      for (const row of siblings) {
        const c = (row.config ?? {}) as Record<string, unknown>;
        const u = normalizeEvolutionApiBaseUrl(String(c["apiUrl"] ?? ""));
        const n = String(c["instanceName"] ?? "").trim().toLowerCase();
        if (u === apiUrlNorm && n === instNorm) {
          return NextResponse.json(
            {
              error:
                "Já existe integração Evolution com esta URL e nome de instância. Remova a duplicata na lista ou reutilize a conta existente.",
              existingIntegrationId: row.id,
            },
            { status: 409 },
          );
        }
      }

      config = {
        apiUrl: apiUrlNorm,
        apiKey: encrypt(parsed.data.apiKey),
        instanceName: defaultSanitizer.clean(parsed.data.instanceName).trim(),
      };
    }

    const integration = await db.workspaceIntegration.create({
      data: {
        workspaceId: session.workspaceId,
        type: parsed.data.type,
        name,
        config,
        status: "ACTIVE",
      },
      select: { id: true, name: true, type: true, status: true, createdAt: true },
    });

    await appendAuditLog({
      workspaceId: session.workspaceId,
      action: "integration.whatsapp.create",
      input: { type: parsed.data.type, name },
      output: { integrationId: integration.id },
    });

    return NextResponse.json({ ok: true, integration }, { status: 201 });
  } catch (err) {
    console.error("[integrations/whatsapp/create]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
