/**
 * FlowOS v4 — Email Sender Provider
 * [SEC-02] Credenciais só de process.env / config criptografado
 * [SEC-03] workspaceId obrigatório em toda query Prisma
 * [SEC-06] AuditLog append-only via create()
 */

import nodemailer from "nodemailer";
import Imap from "imap";
import { db } from "@flow-os/db";

// ─── Audit helper (padrão do projeto) ─────────────────────────────────────────

async function resolveAuditAgentId(workspaceId: string): Promise<string | null> {
  const agent = await db.agent.findFirst({
    where: { workspaceId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return agent?.id ?? null;
}

async function writeAuditLog(params: {
  workspaceId: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
}): Promise<void> {
  const agentId = await resolveAuditAgentId(params.workspaceId);
  if (!agentId) return;

  type JsonValue = Parameters<typeof db.agentAuditLog.create>[0]["data"]["input"];

  await db.agentAuditLog.create({
    data: {
      workspaceId: params.workspaceId,
      agentId,
      action: params.action,
      input: params.input as JsonValue,
      output: params.output as JsonValue,
      modelUsed: "none",
      tokensUsed: 0,
      costUsd: 0,
      durationMs: params.durationMs,
      success: params.success,
      ...(params.error ? { error: params.error } : {}),
    },
  });
}

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface SendEmailParams {
  accountId: string;
  workspaceId: string;
  to: string[];
  cc?: string[] | undefined;
  subject: string;
  bodyText: string;
  bodyHtml?: string | undefined;
  inReplyTo?: string | undefined;
  dealId?: string | undefined;
}

// ─── Teste de conexão IMAP ─────────────────────────────────────────────────────

export async function testEmailConnection(
  accountId: string,
  workspaceId: string,
): Promise<boolean> {
  // [SEC-03] workspaceId na query
  const account = await db.emailAccount.findFirst({
    where: { id: accountId, workspaceId },
  });
  if (!account) return false;

  const config = account.config as Record<string, string>;

  return new Promise<boolean>((resolve) => {
    const imap = new Imap({
      user: config["email"] ?? "",
      password: config["password"] ?? "",
      host: config["imapHost"] ?? "localhost",
      port: parseInt(config["imapPort"] ?? "993"),
      tls: config["tls"] !== "false",
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
    });
    imap.once("ready", () => { imap.end(); resolve(true); });
    imap.once("error", () => resolve(false));
    imap.connect();
  });
}

// ─── Envio ─────────────────────────────────────────────────────────────────────

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const t0 = Date.now();

  // [SEC-03] workspaceId filtra a conta — nunca da URL/body sem validação
  const account = await db.emailAccount.findFirst({
    where: { id: params.accountId, workspaceId: params.workspaceId },
  });
  if (!account) throw new Error("Email account not found");

  const config = account.config as Record<string, string>;

  // [SEC-02] Credenciais vêm do config armazenado (criptografado em repouso)
  const transporter = nodemailer.createTransport({
    host: config["smtpHost"] ?? "localhost",
    port: parseInt(config["smtpPort"] ?? "587"),
    secure: config["smtpPort"] === "465",
    auth: {
      user: config["email"] ?? "",
      pass: config["password"] ?? "",
    },
  });

  const info = await transporter.sendMail({
    from: `${account.nome} <${account.email}>`,
    to: params.to.join(", "),
    ...(params.cc?.length ? { cc: params.cc.join(", ") } : {}),
    subject: params.subject,
    text: params.bodyText,
    ...(params.bodyHtml ? { html: params.bodyHtml } : {}),
    ...(params.inReplyTo ? { inReplyTo: params.inReplyTo } : {}),
  });

  await db.email.create({
    data: {
      workspaceId: params.workspaceId,
      accountId: params.accountId,
      messageId: info.messageId,
      from: account.email,
      to: params.to,
      cc: params.cc ?? [],
      subject: params.subject,
      bodyText: params.bodyText,
      bodyHtml: params.bodyHtml ?? null,
      dealId: params.dealId ?? null,
      enviado: true,
      lido: true,
      receivedAt: new Date(),
    },
  });

  // [SEC-06] AuditLog append-only
  await writeAuditLog({
    workspaceId: params.workspaceId,
    action: "email_send",
    input: { to: params.to, subject: params.subject },
    output: { messageId: info.messageId },
    durationMs: Date.now() - t0,
    success: true,
  });
}
