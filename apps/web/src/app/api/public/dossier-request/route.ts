/**
 * POST /api/public/dossier-request — formulario publico de captacao.
 * SEM autenticacao de sessao.
 * [SEC-08] sanitizar todos os campos (input externo).
 * [SEC-06] audit log: PUBLIC_DOSSIER_REQUEST.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@flow-os/db";
import type { Prisma } from "@flow-os/db";
import { ensureOpenDealForContact } from "@/lib/lead-deal";
import { appendAuditLog } from "@/lib/chatguru-api";
import { dispatchFieldAgents } from "@flow-os/brain";

// [SEC-08] Sanitize string: trim, remove control chars, limit length
function sanitize(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

function sanitizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  // Keep only digits
  return value.replace(/\D/g, "").slice(0, 15);
}

// Rate limiting: track requests per phone per 24h in memory
// For production, this should use Redis. In-memory is sufficient for single-instance.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(phone: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(phone);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(phone, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo invalido" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  // [SEC-08] Sanitize all inputs
  const nome = sanitize(raw["nome"], 120);
  const telefone = sanitizePhone(raw["telefone"]);
  const endereco = sanitize(raw["endereco"], 256);
  const uf = sanitize(raw["uf"], 2).toUpperCase();
  const valor = sanitize(raw["valor"], 20);
  const tipoPagamento = sanitize(raw["tipoPagamento"], 20).toLowerCase();
  const obs = sanitize(raw["obs"], 500);
  const ref = sanitize(raw["ref"], 64);

  // Validate required fields
  if (!nome) {
    return NextResponse.json({ error: "Nome obrigatorio" }, { status: 400 });
  }
  if (!telefone || telefone.length < 10) {
    return NextResponse.json({ error: "WhatsApp invalido" }, { status: 400 });
  }
  if (!endereco) {
    return NextResponse.json({ error: "Endereco obrigatorio" }, { status: 400 });
  }
  if (!uf || uf.length !== 2) {
    return NextResponse.json({ error: "UF obrigatoria" }, { status: 400 });
  }
  if (!ref) {
    return NextResponse.json({ error: "Referencia (ref) obrigatoria" }, { status: 400 });
  }

  // Rate limiting: max 3 requests per phone per 24h
  if (!checkRateLimit(telefone)) {
    return NextResponse.json(
      { error: "Limite de solicitacoes atingido. Tente novamente em 24h." },
      { status: 429 },
    );
  }

  // 1. Resolve workspace by slug
  const workspace = await db.workspace.findUnique({
    where: { slug: ref },
    select: { id: true, name: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace nao encontrado" }, { status: 404 });
  }

  const workspaceId = workspace.id;

  // 2. Upsert Contact by phone + workspaceId
  let contact = await db.contact.findFirst({
    where: { workspaceId, phone: telefone },
    select: { id: true },
  });

  if (!contact) {
    contact = await db.contact.create({
      data: {
        workspaceId,
        name: nome,
        phone: telefone,
        leadLifecycle: "PROSPECT",
      },
      select: { id: true },
    });
  }

  // 3. Create Deal with property meta
  const metaPatch: Record<string, unknown> = {
    imovelEndereco: endereco,
    imovelUF: uf,
    origem: "formulario-publico",
  };
  if (valor) metaPatch["valorEstimado"] = valor;
  if (tipoPagamento) metaPatch["tipoPagamento"] = tipoPagamento;
  if (obs) metaPatch["observacoes"] = obs;

  const dealId = await ensureOpenDealForContact(
    workspaceId,
    contact.id,
    metaPatch,
    `Dossie gratuito - ${nome}`,
  );

  // 5. Audit log [SEC-06]
  await appendAuditLog({
    workspaceId,
    action: "PUBLIC_DOSSIER_REQUEST",
    input: { nome, telefone: `${telefone.slice(0, 4)}****`, endereco, uf, ref } as Prisma.InputJsonObject,
    output: { contactId: contact.id, dealId } as Prisma.InputJsonObject,
  }).catch(() => undefined);

  // 6. Dispatch field agents (motoboys) automatically
  try {
    await dispatchFieldAgents(dealId, workspaceId);
  } catch (err) {
    console.error("[public/dossier-request] dispatchFieldAgents failed:", err);
    // Don't fail the request — the deal is created, dispatch can be retried
  }

  return NextResponse.json({
    ok: true,
    message: "Recebemos sua solicitacao!",
  });
}
