export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, type Prisma } from "@flow-os/db";
import { getSessionContext } from "@/lib/session";
import { appendAuditLog } from "@/lib/chatguru-api";
import { encrypt } from "@/lib/encrypt";

const AGENT_NAMES = ["PAYMENT_RECOVERY", "RPA_EXTERNAL", "REPORT_GEN", "TOKEN_ROUTER"] as const;
type AgentName = (typeof AGENT_NAMES)[number];

const Schema = z.object({
  enabled: z.boolean().optional(),
  config:  z.record(z.unknown()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentName: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentName } = await params;
  if (!AGENT_NAMES.includes(agentName as AgentName)) {
    return NextResponse.json({ error: "Agente invalido" }, { status: 400 });
  }

  const cfg = await db.agentConfig.findFirst({
    where:  { workspaceId: session.workspaceId, agentName },
    select: { id: true, agentName: true, enabled: true, config: true, updatedAt: true },
  });

  // Config retornada SEM secrets — apenas flags e valores não sensíveis
  const safeConfig = cfg ? sanitizeConfigForClient(cfg.config as Record<string, unknown>) : {};
  return NextResponse.json({ agentConfig: cfg ? { ...cfg, config: safeConfig } : null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentName: string }> },
) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentName } = await params;
  if (!AGENT_NAMES.includes(agentName as AgentName)) {
    return NextResponse.json({ error: "Agente invalido" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // [SEC-02] Criptografar campos sensíveis da config
  const rawConfig = (parsed.data.config ?? {}) as Record<string, unknown>;
  const safeConfig = encryptSensitiveFields(rawConfig, agentName as AgentName);

  const cfg = await db.agentConfig.upsert({
    where:  { workspaceId_agentName: { workspaceId: session.workspaceId, agentName } },
    create: {
      workspaceId: session.workspaceId,
      agentName,
      enabled:     parsed.data.enabled ?? true,
      config:      safeConfig as Prisma.InputJsonObject,
    },
    update: {
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.config  !== undefined ? { config:  safeConfig as Prisma.InputJsonObject } : {}),
    },
    select: { id: true, agentName: true, enabled: true, updatedAt: true },
  });

  await appendAuditLog({
    workspaceId: session.workspaceId,
    action:      `agent.config.update`,
    input:       { agentName, enabled: parsed.data.enabled, fields: Object.keys(rawConfig) },
    output:      { agentConfigId: cfg.id },
  });

  return NextResponse.json({ ok: true, agentConfig: cfg });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SENSITIVE_FIELDS = ["caixaPass", "caixaTotpSecret", "anthropicApiKey", "openaiApiKey", "apiKey"];

function encryptSensitiveFields(config: Record<string, unknown>, _agentName: AgentName): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    result[k] = SENSITIVE_FIELDS.includes(k) && typeof v === "string"
      ? encrypt(v)
      : v;
  }
  return result;
}

function sanitizeConfigForClient(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    result[k] = SENSITIVE_FIELDS.includes(k) ? "••••••••" : v;
  }
  return result;
}
