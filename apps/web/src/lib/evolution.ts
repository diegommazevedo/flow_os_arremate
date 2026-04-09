/**
 * Re-export Evolution helpers do pacote `@flow-os/brain` (fonte única).
 */
export {
  normalizeInstancesPayload,
  ensureInstanceOpen,
  parseEvolutionConnectionStateJson,
  isEvolutionSessionOpenState,
  type EnsureInstanceOpenOpts,
} from "@flow-os/brain/evolution/instance-state";

/** Marca da rota de QR no FlowOS (confirmar deploy / troubleshooting). */
/** Incrementar quando mudar a estratégia de QR (confirmar deploy via resposta JSON). */
export const EVOLUTION_QR_FLOW = "connect-v2.1.2-retries" as const;

/**
 * Base URL da REST Evolution (host raiz). Não usar URL do manager (/manager) nem barra final.
 * Quando a integração copia do browser `…/manager`, o caminho vira `…/manager/instance/connect/…` → 404.
 */
export function normalizeEvolutionApiBaseUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return "";
  u = u.replace(/\/$/, "");
  if (/\/manager$/i.test(u)) {
    u = u.replace(/\/manager$/i, "");
    u = u.replace(/\/$/, "");
  }
  return u;
}
