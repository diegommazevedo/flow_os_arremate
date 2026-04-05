/**
 * [SEC-02] Criptografia AES-256-GCM para credenciais de integração em repouso.
 * Chave de 32 bytes (64 hex chars) em INTEGRATION_ENCRYPTION_KEY.
 * Em dev sem chave: passa os valores sem criptografia (não usar em produção).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer | null {
  const hex = process.env["INTEGRATION_ENCRYPTION_KEY"] ?? "";
  if (hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

export function encrypt(text: string): string {
  const key = getKey();
  if (!key) return text; // dev fallback — sem chave configurada
  const iv        = randomBytes(12);
  const cipher    = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag       = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(data: string): string {
  const key = getKey();
  if (!key) return data; // dev fallback
  try {
    const buf       = Buffer.from(data, "base64");
    const iv        = buf.subarray(0, 12);
    const tag       = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher  = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    return data; // não era criptografado (migração)
  }
}

/** Máscara para exibição no frontend — [SEC-02] secrets nunca voltam ao cliente */
export function maskSecret(value: string): string {
  if (!value || value.length < 4) return "••••";
  return "••••" + value.slice(-4);
}
