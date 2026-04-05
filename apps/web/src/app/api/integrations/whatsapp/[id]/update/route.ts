export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, type Prisma } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { encrypt } from "@/lib/encrypt";

const Schema = z.object({
  name:               z.string().min(1).max(120).optional(),
  accessToken:        z.string().min(1).optional(),
  phoneNumberId:      z.string().min(1).optional(),
  appSecret:          z.string().min(1).optional(),
  webhookVerifyToken: z.string().min(1).optional(),
  autoReply:          z.boolean().optional(),
  apiUrl:             z.string().url().optional(),
  apiKey:             z.string().min(1).optional(),
  instanceName:       z.string().min(1).max(80).optional(),
  status:             z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.workspaceIntegration.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, type: true, config: true },
  });
  if (!existing) return NextResponse.json({ error: "Integracao nao encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const prevConfig = (existing.config ?? {}) as Record<string, unknown>;
  const configPatch: Record<string, unknown> = { ...prevConfig };

  // [SEC-02] Criptografar apenas os campos alterados
  if (parsed.data.accessToken)        configPatch["accessToken"]        = encrypt(parsed.data.accessToken);
  if (parsed.data.phoneNumberId)      configPatch["phoneNumberId"]      = encrypt(parsed.data.phoneNumberId);
  if (parsed.data.appSecret)          configPatch["appSecret"]          = encrypt(parsed.data.appSecret);
  if (parsed.data.webhookVerifyToken) configPatch["webhookVerifyToken"] = encrypt(parsed.data.webhookVerifyToken);
  if (parsed.data.autoReply !== undefined) configPatch["autoReply"]     = parsed.data.autoReply;
  if (parsed.data.apiUrl)             configPatch["apiUrl"]             = defaultSanitizer.clean(parsed.data.apiUrl);
  if (parsed.data.apiKey)             configPatch["apiKey"]             = encrypt(parsed.data.apiKey);
  if (parsed.data.instanceName)       configPatch["instanceName"]       = defaultSanitizer.clean(parsed.data.instanceName);

  const updateData: Record<string, unknown> = { config: configPatch as Prisma.InputJsonObject };
  if (parsed.data.name)   updateData["name"]   = defaultSanitizer.clean(parsed.data.name);
  if (parsed.data.status) updateData["status"] = parsed.data.status;

  const updated = await db.workspaceIntegration.update({
    where:  { id: existing.id },
    data:   updateData,
    select: { id: true, name: true, type: true, status: true, createdAt: true },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action:      "integration.whatsapp.update",
    input:       { integrationId: id, fields: Object.keys(parsed.data) },
    output:      { integrationId: updated.id },
  });

  return NextResponse.json({ ok: true, integration: updated });
}
