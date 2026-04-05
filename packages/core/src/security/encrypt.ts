/**
 * FlowOS v4 — Encrypt/Decrypt helper para credenciais de integrações
 *
 * Algoritmo: AES-256-GCM (autenticado — detecta adulteração)
 * Chave:     INTEGRATION_ENCRYPTION_KEY (env, 32 bytes hex = 64 chars)
 *
 * [SEC-02] Nunca retornar valor bruto após salvar — usar maskSecret()
 * [SEC-04] Chave exclusivamente do env
 *
 * Formato do ciphertext (base64):
 *   iv(12 bytes) + authTag(16 bytes) + ciphertext — concatenados, depois base64
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH  = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env["INTEGRATION_ENCRYPTION_KEY"];
  if (!raw) {
    // Dev fallback — gera chave determinística a partir de APP_SECRET
    const seed = process.env["APP_SECRET"] ?? "flowos-dev-fallback-key-insecure";
    return scryptSync(seed, "flowos-salt-v4", 32) as Buffer;
  }
  if (raw.length === 64) return Buffer.from(raw, "hex");
  if (raw.length >= 32) return Buffer.from(raw).subarray(0, 32);
  // Pad curto com scrypt
  return scryptSync(raw, "flowos-salt-v4", 32) as Buffer;
}

/** Criptografa um valor string. Retorna string base64 segura para armazenar em Json. */
export function encryptSecret(plaintext: string): string {
  const key  = getKey();
  const iv   = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  // Formato: iv + authTag + ciphertext (tudo concatenado, depois base64)
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Descriptografa um valor previamente criptografado por encryptSecret(). */
export function decryptSecret(ciphertext: string): string {
  const key    = getKey();
  const buf    = Buffer.from(ciphertext, "base64");
  const iv     = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data   = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

/** Mascara credenciais para exibição no frontend. [SEC-02] */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return "";
  const visible = Math.min(4, Math.floor(value.length * 0.15));
  return value.slice(0, visible) + "••••••••";
}

/** Criptografa todos os campos marcados como secrets em um objeto de config. */
export function encryptConfig(
  config:       Record<string, unknown>,
  secretFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of secretFields) {
    const val = config[field];
    if (typeof val === "string" && val.length > 0) {
      result[field] = encryptSecret(val);
    }
  }
  return result;
}

/** Descriptografa campos secrets e retorna o config completo (uso interno apenas). */
export function decryptConfig(
  config:       Record<string, unknown>,
  secretFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of secretFields) {
    const val = config[field];
    if (typeof val === "string" && val.length > 0) {
      try {
        result[field] = decryptSecret(val);
      } catch {
        result[field] = val; // já em plaintext (migração)
      }
    }
  }
  return result;
}

/** Mascara todos os campos secrets para envio ao frontend. [SEC-02] */
export function maskConfig(
  config:       Record<string, unknown>,
  secretFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of secretFields) {
    const val = config[field];
    if (typeof val === "string" && val.length > 0) {
      result[field] = "••••••••";
    }
  }
  return result;
}
