/**
 * FlowOS v4 — WhatsApp Meta API Provider
 *
 * [SEC-02] META_ACCESS_TOKEN apenas do env — nunca hardcoded
 * [SEC-06] AuditLog de cada envio (append-only)
 *
 * Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

import { db } from "@flow-os/db";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TemplateParam {
  type:  "text" | "currency" | "date_time";
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
}

export interface TemplateComponent {
  type:       "header" | "body" | "button";
  sub_type?:  "url" | "quick_reply";
  index?:     number;
  parameters: TemplateParam[];
}

export interface SendTextResult  { ok: boolean; messageId?: string; error?: string }
export interface SendTemplateResult { ok: boolean; messageId?: string; error?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfig(): { token: string; phoneNumberId: string } {
  const token       = process.env["META_ACCESS_TOKEN"];
  const phoneId     = process.env["META_PHONE_NUMBER_ID"];

  if (!token)   throw new Error("[WhatsAppMeta] META_ACCESS_TOKEN não configurado. Verifique o .env.");
  if (!phoneId) throw new Error("[WhatsAppMeta] META_PHONE_NUMBER_ID não configurado. Verifique o .env.");

  return { token, phoneNumberId: phoneId };
}

function normalizePhone(phone: string): string {
  // Garantir apenas dígitos. Prefixo 55 para BR se não tiver código de país.
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") || digits.length <= 10 ? digits : `55${digits}`;
}

const META_API_VERSION = "v19.0";
const META_BASE        = "https://graph.facebook.com";

async function postMeta(
  phoneNumberId: string,
  token: string,
  body:  Record<string, unknown>,
  attempt = 1,
): Promise<{ ok: boolean; messageId: string | null; status: number; raw: string }> {
  const url = `${META_BASE}/${META_API_VERSION}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();

  // Retry 1x em erros 5xx (server-side)
  if (!res.ok && res.status >= 500 && attempt === 1) {
    await new Promise(r => setTimeout(r, 400));
    return postMeta(phoneNumberId, token, body, 2);
  }

  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { messages?: Array<{ id: string }> };
    messageId = parsed.messages?.[0]?.id ?? null;
  } catch { /* ignore */ }

  return { ok: res.ok, messageId, status: res.status, raw };
}

// ─── Audit helper ────────────────────────────────────────────────────────────

async function writeAuditLog(params: {
  workspaceId: string;
  agentId:     string;
  action:      string;
  input:       Record<string, unknown>;
  output:      Record<string, unknown>;
  durationMs:  number;
  success:     boolean;
  errorMsg?:   string;
}) {
  try {
    // Cast explícito para InputJsonValue requerido pelo Prisma [exactOptionalPropertyTypes]
    type JsonVal = Parameters<typeof db.agentAuditLog.create>[0]["data"]["input"];
    await db.agentAuditLog.create({
      data: {
        workspaceId: params.workspaceId,
        agentId:     params.agentId,
        action:      params.action,
        input:       params.input as unknown as JsonVal,
        output:      params.output as unknown as JsonVal,
        modelUsed:   "none",
        tokensUsed:  0,
        costUsd:     0,
        durationMs:  params.durationMs,
        success:     params.success,
        ...(params.errorMsg ? { error: params.errorMsg } : {}),
      },
    });
  } catch (e) {
    console.error("[WhatsAppMeta] AuditLog write failed:", e);
  }
}

// ─── Classe principal ─────────────────────────────────────────────────────────

export class WhatsAppMetaProvider {

  // ── sendText ──────────────────────────────────────────────────────────────

  /**
   * Envia mensagem de texto livre (só funciona dentro da janela de 24h Meta).
   *
   * @param phone       Número destino (com ou sem código de país)
   * @param message     Corpo do texto
   * @param workspaceId Para AuditLog [SEC-06]
   * @param agentId     ID do agente responsável (default: "whatsapp_provider")
   */
  async sendText(
    phone:       string,
    message:     string,
    workspaceId: string,
    agentId      = "whatsapp_provider",
  ): Promise<SendTextResult> {
    const startMs = Date.now();
    let config: ReturnType<typeof getConfig>;

    try {
      config = getConfig();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      // [SEC-02] Não logar o token — apenas a mensagem de erro descritiva
      return { ok: false, error: err };
    }

    const to   = normalizePhone(phone);
    const body = {
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to,
      type: "text",
      text: { preview_url: false, body: message },
    };

    const result = await postMeta(config.phoneNumberId, config.token, body);

    await writeAuditLog({
      workspaceId,
      agentId,
      action:    "whatsapp_send_text",
      input:     { to, messageLength: message.length },
      output:    { ok: result.ok, messageId: result.messageId, status: result.status },
      durationMs: Date.now() - startMs,
      success:   result.ok,
      ...(result.ok ? {} : { errorMsg: `HTTP ${result.status}` }),
    });

    if (!result.ok) {
      return { ok: false, error: `Meta API ${result.status}: ${result.raw.slice(0, 200)}` } satisfies SendTextResult;
    }

    return { ok: true, ...(result.messageId ? { messageId: result.messageId } : {}) } satisfies SendTextResult;
  }

  // ── sendTemplate ──────────────────────────────────────────────────────────

  /**
   * Envia template aprovado no Meta Business Manager.
   * Usado pelo PaymentRecoveryBot.
   *
   * @param phone        Número destino
   * @param templateName Nome exato do template aprovado
   * @param languageCode ex: "pt_BR"
   * @param components   Parâmetros dos componentes header/body/button
   * @param workspaceId  Para AuditLog [SEC-06]
   * @param agentId      ID do agente
   */
  async sendTemplate(
    phone:        string,
    templateName: string,
    languageCode: string,
    components:   TemplateComponent[],
    workspaceId:  string,
    agentId       = "whatsapp_provider",
  ): Promise<SendTemplateResult> {
    const startMs = Date.now();
    let config: ReturnType<typeof getConfig>;

    try {
      config = getConfig();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { ok: false, error: err };
    }

    const to   = normalizePhone(phone);
    const body = {
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to,
      type: "template",
      template: {
        name:     templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    const result = await postMeta(config.phoneNumberId, config.token, body);

    await writeAuditLog({
      workspaceId,
      agentId,
      action:    "whatsapp_send_template",
      input:     { to, templateName, languageCode },
      output:    { ok: result.ok, messageId: result.messageId, status: result.status },
      durationMs: Date.now() - startMs,
      success:   result.ok,
      ...(result.ok ? {} : { errorMsg: `HTTP ${result.status}` }),
    });

    if (!result.ok) {
      return { ok: false, error: `Meta API ${result.status}: ${result.raw.slice(0, 200)}` } satisfies SendTemplateResult;
    }

    return { ok: true, ...(result.messageId ? { messageId: result.messageId } : {}) } satisfies SendTemplateResult;
  }
}

/** Singleton — reutiliza entre chamadas */
export const whatsAppMeta = new WhatsAppMetaProvider();
