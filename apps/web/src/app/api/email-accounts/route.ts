export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import { encrypt } from "@/lib/encrypt";
import { getSessionWorkspaceId } from "@/lib/session";

const CreateSchema = z.object({
  tipo:  z.string().min(1).max(60),
  nome:  z.string().min(1).max(120),
  email: z.string().email(),
  config: z.object({
    imapHost:  z.string().min(1),
    imapPort:  z.string().regex(/^\d+$/),
    smtpHost:  z.string().min(1),
    smtpPort:  z.string().regex(/^\d+$/),
    password:  z.string().min(1),
    tls:       z.string().optional(),
  }),
});

// POST /api/email-accounts — cria conta com config criptografado [SEC-02]
export async function POST(req: NextRequest) {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // [SEC-08] Sanitizar textos externos
  const safeTipo = defaultSanitizer.clean(parsed.data.tipo);
  const safeNome = defaultSanitizer.clean(parsed.data.nome);

  // [SEC-02] Criptografar password em repouso
  const encryptedConfig = {
    ...parsed.data.config,
    email: parsed.data.email,
    password: encrypt(parsed.data.config.password),
  };

  const account = await db.emailAccount.create({
    data: {
      workspaceId, // [SEC-03]
      tipo:  safeTipo,
      nome:  safeNome,
      email: parsed.data.email,
      config: encryptedConfig,
    },
    select: { id: true, tipo: true, nome: true, email: true, status: true, createdAt: true },
  });

  // [SEC-06] AuditLog append-only — criação de conta
  const agent = await db.agent.findFirst({ where: { workspaceId }, select: { id: true } });
  if (agent) {
    await db.agentAuditLog.create({
      data: {
        workspaceId,
        agentId:   agent.id,
        action:    "email_account.create",
        input:     { email: parsed.data.email, tipo: safeTipo },
        output:    { accountId: account.id },
        modelUsed: "none",
        tokensUsed: 0,
        costUsd:   0,
        durationMs: 0,
        success:   true,
      },
    });
  }

  return NextResponse.json({ ok: true, account }, { status: 201 });
}
