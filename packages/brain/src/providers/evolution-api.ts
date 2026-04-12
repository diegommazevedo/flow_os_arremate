import { db } from "@flow-os/db";
import { ensureInstanceOpen } from "../evolution/instance-state";

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

export class EvolutionApiProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = (process.env["EVOLUTION_API_URL"] ?? "http://localhost:8080").replace(/\/+$/, "");
    this.apiKey = process.env["EVOLUTION_API_KEY"] ?? "";
  }

  private normalizeMediaUrlForEvolution(mediaUrl: string): string {
    const publicMinioUrl = process.env["MINIO_PUBLIC_URL"]?.replace(/\/+$/, "");
    if (!publicMinioUrl) return mediaUrl;

    try {
      if (mediaUrl.startsWith("/")) {
        return `${publicMinioUrl}${mediaUrl}`;
      }

      const parsed = new URL(mediaUrl);
      const isPrivateHost =
        parsed.hostname.includes("railway.internal") ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1";

      if (!isPrivateHost) return mediaUrl;

      const publicBase = new URL(publicMinioUrl);
      parsed.protocol = publicBase.protocol;
      parsed.host = publicBase.host;
      return parsed.toString();
    } catch {
      return mediaUrl;
    }
  }

  async sendText(
    instance: string,
    phone: string,
    message: string,
    workspaceId: string,
  ): Promise<void> {
    const startedAt = Date.now();
    const res = await fetch(`${this.baseUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: message,
        options: { delay: 1200, presence: "composing" },
      }),
    });

    await writeAuditLog({
      workspaceId,
      action: "evolution_send_text",
      input: { instance, phoneSuffix: phone.slice(-4) },
      output: { status: res.status },
      durationMs: Date.now() - startedAt,
      success: res.ok,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    });

    if (!res.ok) {
      throw new Error(`Evolution sendText failed: ${res.status}`);
    }
  }

  async sendMedia(
    instance: string,
    phone: string,
    mediaUrl: string,
    mediaType: "image" | "document" | "audio" | "video",
    caption: string,
    workspaceId: string,
    fileName?: string,
  ): Promise<void> {
    await ensureInstanceOpen(instance, { baseUrl: this.baseUrl, apiKey: this.apiKey });
    const resolvedMediaUrl = this.normalizeMediaUrlForEvolution(mediaUrl);

    // Evolution v2 exige mimetype; derivamos da URL ou tipo
    const mimeMap: Record<string, string> = {
      image: "image/png",
      video: "video/mp4",
      audio: "audio/ogg",
      document: "application/pdf",
    };
    const mimetype = mimeMap[mediaType] ?? "application/octet-stream";

    // Áudio usa endpoint dedicado (sendWhatsAppAudio)
    const isAudio = mediaType === "audio";
    const endpoint = isAudio
      ? `${this.baseUrl}/message/sendWhatsAppAudio/${instance}`
      : `${this.baseUrl}/message/sendMedia/${instance}`;

    const payload = isAudio
      ? { number: phone, audio: resolvedMediaUrl }
      : {
          number: phone,
          mediatype: mediaType,
          mimetype,
          media: resolvedMediaUrl,
          caption,
          ...(fileName ? { fileName } : {}),
        };

    const startedAt = Date.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    await writeAuditLog({
      workspaceId,
      action: "evolution_send_media",
      input: { instance, phoneSuffix: phone.slice(-4), mediaType },
      output: { status: res.status },
      durationMs: Date.now() - startedAt,
      success: res.ok,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    });

    if (!res.ok) {
      throw new Error(`Evolution sendMedia failed: ${res.status}`);
    }
  }

  async getQRCode(instance: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/instance/connect/${instance}`, {
      headers: { apikey: this.apiKey },
    });
    const data = (await res.json()) as { code?: string; qrcode?: string };
    return data.code ?? data.qrcode ?? "";
  }

  async getStatus(instance: string): Promise<"open" | "close" | "connecting"> {
    const res = await fetch(`${this.baseUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: this.apiKey },
    });
    const data = (await res.json()) as { instance?: { state?: "open" | "close" | "connecting" } };
    return data.instance?.state ?? "close";
  }
}

export const evolutionApi = new EvolutionApiProvider();
