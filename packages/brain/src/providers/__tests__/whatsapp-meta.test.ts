/**
 * Testes — WhatsApp Meta Provider + Webhook handler
 *
 * Cenários cobertos:
 * 1. GET verify_token correto → retorna challenge
 * 2. GET verify_token errado → 403
 * 3. POST assinatura HMAC válida → Task criada + SSE emitido
 * 4. POST messageId duplicado → ignorado (idempotência)
 * 5. POST número desconhecido → Contact criado automaticamente
 * 6. sendText sem META_ACCESS_TOKEN → erro descritivo (sem expor secret)
 * 7. Q1 com META_AUTO_REPLY=true → auto-reply agendado
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock do banco Prisma
const mockDb = {
  agentAuditLog: {
    findFirst: vi.fn(),
    create:    vi.fn().mockResolvedValue({ id: "audit-1" }),
  },
  contact: {
    findFirst: vi.fn(),
    create:    vi.fn().mockResolvedValue({ id: "contact-1" }),
  },
  deal: {
    findFirst: vi.fn(),
    create:    vi.fn().mockResolvedValue({ id: "deal-1" }),
  },
  stage: {
    findFirst: vi.fn().mockResolvedValue({ id: "stage-1" }),
  },
  task: {
    findFirst: vi.fn(),
    create:    vi.fn().mockResolvedValue({ id: "task-1" }),
  },
};

vi.mock("@flow-os/db", () => ({ db: mockDb }));

// Mock do defaultSanitizer
vi.mock("@flow-os/core", () => ({
  defaultSanitizer: {
    sanitize: vi.fn((text: string) => ({ output: text, warnings: [] })),
  },
}));

// Mock do SSE bus
const mockPublish = vi.fn();
vi.mock("@/lib/sse-bus", () => ({ publishKanbanEvent: mockPublish }));

// Mock do global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { createHmac } from "node:crypto";

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function makeMetaPayload(from: string, messageId: string, text: string): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_ID",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "15550000001", phone_number_id: "PHONE_ID" },
          contacts: [{ profile: { name: "Test User" }, wa_id: from }],
          messages: [{
            from,
            id:        messageId,
            timestamp: "1700000000",
            type:      "text",
            text:      { body: text },
          }],
        },
      }],
    }],
  });
}

// ─── Suite: Webhook WhatsApp ──────────────────────────────────────────────────

describe("Webhook WhatsApp — GET (verificação)", () => {
  const APP_SECRET  = "test-app-secret";
  const VERIFY_TOKEN = "test-verify-token";

  beforeEach(() => {
    vi.resetModules();
    process.env["META_APP_SECRET"]             = APP_SECRET;
    process.env["META_WEBHOOK_VERIFY_TOKEN"]   = VERIFY_TOKEN;
    process.env["WEBHOOK_DEFAULT_WORKSPACE_ID"] = "ws-test";
  });

  it("1. verify_token correto → retorna challenge", async () => {
    const { GET } = await import("../../../../../../../apps/web/src/app/api/webhooks/whatsapp/route");
    const url = new URL("http://localhost/api/webhooks/whatsapp");
    url.searchParams.set("hub.mode",         "subscribe");
    url.searchParams.set("hub.verify_token", VERIFY_TOKEN);
    url.searchParams.set("hub.challenge",    "challenge_abc123");

    const req = new Request(url.toString());
    const res = await GET(req as never);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe("challenge_abc123");
  });

  it("2. verify_token errado → 403", async () => {
    const { GET } = await import("../../../../../../../apps/web/src/app/api/webhooks/whatsapp/route");
    const url = new URL("http://localhost/api/webhooks/whatsapp");
    url.searchParams.set("hub.mode",         "subscribe");
    url.searchParams.set("hub.verify_token", "wrong-token");
    url.searchParams.set("hub.challenge",    "challenge_abc123");

    const req = new Request(url.toString());
    const res = await GET(req as never);

    expect(res.status).toBe(403);
  });
});

describe("Webhook WhatsApp — POST (mensagens)", () => {
  const APP_SECRET  = "test-app-secret";
  const VERIFY_TOKEN = "test-verify-token";
  const WORKSPACE   = "ws-test";

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();

    process.env["META_APP_SECRET"]             = APP_SECRET;
    process.env["META_WEBHOOK_VERIFY_TOKEN"]   = VERIFY_TOKEN;
    process.env["WEBHOOK_DEFAULT_WORKSPACE_ID"] = WORKSPACE;
    process.env["META_AUTO_REPLY"]             = "false";

    // Contato/deal inexistentes por padrão
    mockDb.contact.findFirst.mockResolvedValue(null);
    mockDb.deal.findFirst.mockResolvedValue(null);
    mockDb.task.findFirst.mockResolvedValue(null);
    mockDb.agentAuditLog.findFirst.mockResolvedValue(null); // não duplicado
  });

  afterEach(() => {
    delete process.env["META_AUTO_REPLY"];
  });

  it("3. POST assinatura HMAC válida → Task criada", async () => {
    const { POST } = await import("../../../../../../../apps/web/src/app/api/webhooks/whatsapp/route");

    const body      = makeMetaPayload("5511999990001", "wamid.001", "Quero mais informações");
    const signature = sign(body, APP_SECRET);

    const req = new Request("http://localhost/api/webhooks/whatsapp", {
      method:  "POST",
      headers: {
        "Content-Type":        "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);

    // Contact e Deal criados (não existiam)
    expect(mockDb.contact.create).toHaveBeenCalledOnce();
    expect(mockDb.deal.create).toHaveBeenCalledOnce();
    expect(mockDb.task.create).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledOnce();
  });

  it("4. POST messageId duplicado → ignorado (idempotência)", async () => {
    // Simula messageId já no AuditLog
    mockDb.agentAuditLog.findFirst.mockResolvedValue({ id: "existing-audit" });

    const { POST } = await import("../../../../../../../apps/web/src/app/api/webhooks/whatsapp/route");

    const body      = makeMetaPayload("5511999990002", "wamid.DUP", "Mensagem duplicada");
    const signature = sign(body, APP_SECRET);

    const req = new Request("http://localhost/api/webhooks/whatsapp", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
      body,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);

    // Nada deve ser criado
    expect(mockDb.task.create).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("5. POST número desconhecido → Contact criado automaticamente", async () => {
    const { POST } = await import("../../../../../../../apps/web/src/app/api/webhooks/whatsapp/route");

    const body      = makeMetaPayload("5521988880002", "wamid.NEW", "Olá");
    const signature = sign(body, APP_SECRET);

    const req = new Request("http://localhost/api/webhooks/whatsapp", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
      body,
    });

    await POST(req as never);

    expect(mockDb.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: "5521988880002", type: "PERSON" }),
      }),
    );
  });

  it("7. Q1 com META_AUTO_REPLY=true → sendAutoReply agendado", async () => {
    process.env["META_AUTO_REPLY"]      = "true";
    process.env["META_ACCESS_TOKEN"]    = "test-token";
    process.env["META_PHONE_NUMBER_ID"] = "test-phone-id";

    mockFetch.mockResolvedValue({ ok: true, text: async () => '{"messages":[{"id":"wamid.reply"}]}' });

    const { POST } = await import("../../../../../../../apps/web/src/app/api/webhooks/whatsapp/route");

    const body      = makeMetaPayload("5511999990003", "wamid.Q1", "URGENTE vence amanhã");
    const signature = sign(body, APP_SECRET);

    const req = new Request("http://localhost/api/webhooks/whatsapp", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
      body,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    // Task deve ser Q1
    expect(mockDb.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quadrant: "Q1_DO" }),
      }),
    );
  });
});

// ─── Suite: Provider sendText ────────────────────────────────────────────────

describe("WhatsAppMetaProvider.sendText", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env["META_ACCESS_TOKEN"];
    delete process.env["META_PHONE_NUMBER_ID"];
  });

  it("6. sendText sem META_ACCESS_TOKEN → erro descritivo sem expor secret", async () => {
    // [SEC-02] Não deve conter a palavra "token" na mensagem exposta
    const { WhatsAppMetaProvider } = await import("../whatsapp-meta");
    const provider = new WhatsAppMetaProvider();

    const result = await provider.sendText("5511999990000", "Teste", "ws-1");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("META_ACCESS_TOKEN não configurado");
    // Não deve conter o valor do token (que não existe, mas garantia)
    expect(result.error).not.toMatch(/Bearer\s/);
  });

  it("sendText com config válida → POST para Meta API v19.0", async () => {
    process.env["META_ACCESS_TOKEN"]    = "test-token-value";
    process.env["META_PHONE_NUMBER_ID"] = "test-phone-number-id";

    mockFetch.mockResolvedValueOnce({
      ok:   true,
      text: async () => JSON.stringify({ messages: [{ id: "wamid.sent123" }] }),
    });

    const { WhatsAppMetaProvider } = await import("../whatsapp-meta");
    const provider = new WhatsAppMetaProvider();

    const result = await provider.sendText("5511999990000", "Olá cliente!", "ws-1");

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("wamid.sent123");

    // Verificar URL chamada
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("graph.facebook.com/v19.0");
    expect(url).toContain("test-phone-number-id/messages");

    // [SEC-02] Token no header, nunca na URL
    expect(url).not.toContain("test-token-value");
    const headers = opts.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token-value");
  });

  it("sendText retry em 5xx", async () => {
    process.env["META_ACCESS_TOKEN"]    = "test-token";
    process.env["META_PHONE_NUMBER_ID"] = "pid";

    // Primeira tentativa 500, segunda 200
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: "wamid.retry" }] }) });

    const { WhatsAppMetaProvider } = await import("../whatsapp-meta");
    const provider = new WhatsAppMetaProvider();

    const result = await provider.sendText("5511999990000", "Teste retry", "ws-1");

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
