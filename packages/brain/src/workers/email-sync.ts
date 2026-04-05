/**
 * FlowOS v4 — Email Sync Worker
 * [P-01] Lógica genérica — keywords setoriais importadas do template
 * [SEC-03] workspaceId sempre do account (nunca hardcoded)
 * [SEC-06] agentAuditLog só via create() — append-only
 * [SEC-08] defaultSanitizer.clean() em todo texto externo
 */

import { EMAIL_CLASSIFICATION_RULES } from "@flow-os/templates";
import { db } from "@flow-os/db";
import { defaultSanitizer } from "@flow-os/core";
import Imap from "imap";
import { simpleParser } from "mailparser";
import type { Readable } from "stream";

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

// ─── Classificação Eisenhower ──────────────────────────────────────────────────
// [P-01] Regras vêm do template — zero keywords hardcoded aqui.

function classifyEmail(subject: string, body: string, from: string): string {
  const rules = EMAIL_CLASSIFICATION_RULES;
  const text = (subject + " " + body + " " + from).toLowerCase();
  const isImportantSender = rules.q1Senders.some((s) => from.includes(s));
  const hasQ1Keyword = rules.q1Keywords.some((k) => text.includes(k));
  if (isImportantSender && hasQ1Keyword) return "Q1_DO";
  if (isImportantSender) return "Q2_PLAN";
  if (hasQ1Keyword) return "Q2_PLAN";
  return "Q3_DELEGATE";
}

// ─── Processamento de mensagem ─────────────────────────────────────────────────

async function processEmail(
  account: { id: string; workspaceId: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsed: any,
): Promise<void> {
  const t0 = Date.now();
  const messageId: string = parsed.messageId ?? `${Date.now()}-${Math.random()}`;

  const exists = await db.email.findUnique({ where: { messageId } });
  if (exists) return;

  // [SEC-08] Sanitizar todo texto externo
  const subject = defaultSanitizer.clean(parsed.subject ?? "");
  const bodyText = defaultSanitizer.clean(parsed.text ?? "");
  const fromName = defaultSanitizer.clean(parsed.from?.text ?? "");
  const fromAddr: string = parsed.from?.value?.[0]?.address ?? "";

  // CHB via regra do template [P-01]
  const chbMatch = (subject + " " + bodyText).match(EMAIL_CLASSIFICATION_RULES.chbPattern);
  const chb = chbMatch?.[1] ?? null;

  let dealId: string | null = null;
  let contactId: string | null = null;

  if (chb) {
    const deal = await db.deal.findFirst({
      where: {
        workspaceId: account.workspaceId,
        // [SEC-03] workspaceId do account (sessão do worker)
        meta: { path: [EMAIL_CLASSIFICATION_RULES.dealMetaKey], equals: chb },
      },
      select: { id: true, contactId: true },
    });
    if (deal) {
      dealId = deal.id;
      contactId = deal.contactId ?? null;
    }
  }

  // Fallback: buscar contato por e-mail [P-02] — usa Contact, não ExternalActor
  if (!contactId && fromAddr) {
    const contact = await db.contact.findFirst({
      where: { workspaceId: account.workspaceId, email: fromAddr },
      select: { id: true },
    });
    if (contact) contactId = contact.id;
  }

  const eisenhower = classifyEmail(subject, bodyText, fromAddr);

  await db.email.create({
    data: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      messageId,
      threadId: parsed.inReplyTo ?? null,
      from: fromAddr,
      fromName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to: (parsed.to?.value?.map((a: any) => a.address ?? "") ?? []) as string[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cc: (parsed.cc?.value?.map((a: any) => a.address ?? "") ?? []) as string[],
      subject,
      bodyText,
      bodyHtml: parsed.html || null,
      dealId,
      contactId,
      eisenhower,
      receivedAt: parsed.date ?? new Date(),
    },
  });

  // Criar task Q1 automática — [P-02] usa quadrant + campos corretos do schema
  if (eisenhower === "Q1_DO" && dealId) {
    await db.task.create({
      data: {
        workspaceId: account.workspaceId,
        dealId,
        title: defaultSanitizer.clean(`Email urgente: ${subject.slice(0, 80)}`),
        description: JSON.stringify({ messageId, from: fromName }),
        quadrant: "Q1_DO",
        priority: "HIGH",
        urgent: true,
        important: true,
      },
    });
  }

  // [SEC-06] AuditLog append-only
  await writeAuditLog({
    workspaceId: account.workspaceId,
    action: "email_sync.process",
    input: { messageId, from: fromName, chb },
    output: { dealId, eisenhower },
    durationMs: Date.now() - t0,
    success: true,
  });
}

// ─── IMAP sync ─────────────────────────────────────────────────────────────────

async function syncImap(account: {
  id: string;
  workspaceId: string;
  config: unknown;
}): Promise<void> {
  const config = account.config as Record<string, string>;
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config["email"] ?? "",
      password: config["password"] ?? "",
      host: config["imapHost"] ?? "localhost",
      port: parseInt(config["imapPort"] ?? "993"),
      tls: config["tls"] !== "false",
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err) => {
        if (err) return reject(err);
        const since = new Date();
        since.setDate(since.getDate() - 1);
        imap.search(["SINCE", since], async (searchErr, results) => {
          if (searchErr) return reject(searchErr);
          if (!results.length) {
            imap.end();
            return resolve();
          }
          const fetch = imap.fetch(results, { bodies: "" });
          const pending: Promise<void>[] = [];
          fetch.on("message", (msg) => {
            msg.on("body", (stream) => {
              const p = simpleParser(stream as unknown as Readable).then((parsed) =>
                processEmail(account, parsed).catch(console.error),
              );
              pending.push(p);
            });
          });
          fetch.once("end", async () => {
            await Promise.allSettled(pending);
            imap.end();
            resolve();
          });
          fetch.once("error", reject);
        });
      });
    });

    imap.once("error", reject);
    imap.connect();
  });
}

// ─── Ponto de entrada público ──────────────────────────────────────────────────

export async function syncEmailAccount(accountId: string): Promise<void> {
  const account = await db.emailAccount.findUnique({
    where: { id: accountId },
  });
  if (!account || account.status === "INACTIVE") return;

  await db.emailAccount.update({
    where: { id: accountId },
    data: { status: "SYNCING" },
  });

  const t0 = Date.now();
  try {
    await syncImap(account);
    await db.emailAccount.update({
      where: { id: accountId },
      data: { status: "ACTIVE", lastSyncAt: new Date() },
    });
  } catch (err) {
    await db.emailAccount.update({
      where: { id: accountId },
      data: { status: "ERROR" },
    });
    // [SEC-06] Log do erro — append-only
    await writeAuditLog({
      workspaceId: account.workspaceId,
      action: "email_sync.error",
      input: { accountId },
      output: {},
      durationMs: Date.now() - t0,
      success: false,
      error: String(err),
    }).catch(() => {});
    throw err;
  }
}
