/**
 * Baixa mídia recebida via webhook Evolution (getBase64FromMediaMessage) ou usa thumbnail.
 */

export type EvolutionMediaKind = "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";

function captionFrom(obj: Record<string, unknown>): string {
  const c = obj["caption"];
  return typeof c === "string" ? c : "";
}

export function detectEvolutionMedia(msg: Record<string, unknown> | undefined): {
  kind: EvolutionMediaKind;
  caption: string;
  mimetype: string | undefined;
  fileName: string | undefined;
} | null {
  if (!msg) return null;

  const im = msg["imageMessage"];
  if (im && typeof im === "object" && im !== null) {
    const o = im as Record<string, unknown>;
    return {
      kind: "IMAGE",
      caption: captionFrom(o),
      mimetype: typeof o["mimetype"] === "string" ? o["mimetype"] : "image/jpeg",
      fileName: undefined,
    };
  }

  const vm = msg["videoMessage"];
  if (vm && typeof vm === "object" && vm !== null) {
    const o = vm as Record<string, unknown>;
    return {
      kind: "VIDEO",
      caption: captionFrom(o),
      mimetype: typeof o["mimetype"] === "string" ? o["mimetype"] : "video/mp4",
      fileName: undefined,
    };
  }

  const am = msg["audioMessage"];
  if (am && typeof am === "object" && am !== null) {
    const o = am as Record<string, unknown>;
    return {
      kind: "AUDIO",
      caption: "",
      mimetype: typeof o["mimetype"] === "string" ? o["mimetype"] : "audio/ogg; codecs=opus",
      fileName: undefined,
    };
  }

  const dm = msg["documentMessage"];
  if (dm && typeof dm === "object" && dm !== null) {
    const o = dm as Record<string, unknown>;
    return {
      kind: "DOCUMENT",
      caption: captionFrom(o),
      mimetype: typeof o["mimetype"] === "string" ? o["mimetype"] : "application/octet-stream",
      fileName: typeof o["fileName"] === "string" ? o["fileName"] : "arquivo",
    };
  }

  return null;
}

export function tryJpegThumbnail(message: Record<string, unknown> | undefined): { buffer: Buffer; mime: string } | null {
  const im = message?.["imageMessage"];
  if (!im || typeof im !== "object" || im === null) return null;
  const thumb = (im as Record<string, unknown>)["jpegThumbnail"];
  if (typeof thumb !== "string" || thumb.length < 40) return null;
  try {
    return { buffer: Buffer.from(thumb, "base64"), mime: "image/jpeg" };
  } catch {
    return null;
  }
}

function decodeBase64Field(raw: string, fallbackMime: string): { buffer: Buffer; mime: string } {
  const trimmed = raw.trim();
  const m = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  if (m?.[1] && m[2]) {
    return { buffer: Buffer.from(m[2], "base64"), mime: m[1] };
  }
  return { buffer: Buffer.from(trimmed, "base64"), mime: fallbackMime };
}

export function extractInlineEvolutionMediaBuffer(params: {
  message: Record<string, unknown> | undefined;
  fallbackMime: string;
}): { buffer: Buffer; mime: string } | null {
  const message = params.message;
  if (!message || typeof message !== "object") return null;

  const candidates: unknown[] = [
    message["base64"],
    (message["imageMessage"] as Record<string, unknown> | undefined)?.["base64"],
    (message["videoMessage"] as Record<string, unknown> | undefined)?.["base64"],
    (message["audioMessage"] as Record<string, unknown> | undefined)?.["base64"],
    (message["documentMessage"] as Record<string, unknown> | undefined)?.["base64"],
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length < 20) continue;
    try {
      return decodeBase64Field(candidate, params.fallbackMime);
    } catch {
      continue;
    }
  }

  return null;
}

function pickBase64FromJson(data: unknown): string | null {
  if (typeof data === "string" && data.length > 20) return data;
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const candidates = [o["base64"], o["data"], (o["data"] as Record<string, unknown> | undefined)?.["base64"]];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 20) return c;
  }
  return null;
}

export async function fetchEvolutionMediaBuffer(params: {
  baseUrl: string;
  apiKey: string;
  instance: string;
  key: { remoteJid?: string; id?: string; fromMe?: boolean };
  message: Record<string, unknown>;
  convertToMp4: boolean;
  fallbackMime: string;
}): Promise<{ buffer: Buffer; mime: string } | null> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(params.instance)}`;

  const bodies: unknown[] = [
    { message: { key: params.key, message: params.message }, convertToMp4: params.convertToMp4 },
    { key: params.key, message: params.message, convertToMp4: params.convertToMp4 },
    { message: params.message, convertToMp4: params.convertToMp4 },
  ];

  for (const body of bodies) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: params.apiKey,
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    if (!res.ok) {
      console.warn("[evolution-fetch-media] POST", res.status, rawText.slice(0, 200));
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      continue;
    }

    const b64 = pickBase64FromJson(parsed);
    if (!b64) continue;

    try {
      return decodeBase64Field(b64, params.fallbackMime);
    } catch {
      continue;
    }
  }

  return null;
}
