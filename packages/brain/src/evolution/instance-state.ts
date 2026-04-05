/**
 * Evolution API — estado das instâncias (fetchInstances).
 * Usado antes de sendText / sendMedia para falhar cedo se a sessão não estiver `open`.
 */

export function normalizeInstancesPayload(raw: unknown): Array<{ instanceName: string; state: string }> {
  const rows: Array<{ instanceName: string; state: string }> = [];

  const pushFromRecord = (o: Record<string, unknown>): void => {
    const inner = o["instance"];
    if (inner && typeof inner === "object" && inner !== null) {
      const inst = inner as Record<string, unknown>;
      const name = String(inst["instanceName"] ?? inst["name"] ?? "");
      const st = String(inst["state"] ?? inst["connectionStatus"] ?? inst["status"] ?? "");
      if (name) rows.push({ instanceName: name, state: st });
      return;
    }
    const name = String(o["instanceName"] ?? o["name"] ?? "");
    const st = String(o["state"] ?? o["connectionStatus"] ?? o["status"] ?? "");
    if (name) rows.push({ instanceName: name, state: st });
  };

  if (raw === null || raw === undefined) return rows;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") pushFromRecord(item as Record<string, unknown>);
    }
    return rows;
  }

  if (typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const nested = r["instances"] ?? r["data"] ?? r["response"];
    if (Array.isArray(nested)) return normalizeInstancesPayload(nested);
    pushFromRecord(r);
  }

  return rows;
}

export type EnsureInstanceOpenOpts = {
  /** Default: EVOLUTION_API_URL ou http://localhost:8080 */
  baseUrl?: string;
  /** Default: EVOLUTION_API_KEY */
  apiKey?: string;
};

/**
 * Garante que a instância aparece em fetchInstances com state `open`.
 */
export async function ensureInstanceOpen(
  instanceName: string,
  opts?: EnsureInstanceOpenOpts,
): Promise<void> {
  const baseUrl = (opts?.baseUrl ?? process.env["EVOLUTION_API_URL"] ?? "http://localhost:8080").replace(
    /\/$/,
    "",
  );
  const apiKey = opts?.apiKey ?? process.env["EVOLUTION_API_KEY"];
  if (!apiKey) {
    throw new Error("EVOLUTION_API_KEY não definida no ambiente");
  }

  const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`EVOLUTION_FETCH: fetchInstances falhou (${res.status})`);
  }

  const raw = await res.json() as unknown;
  const list = normalizeInstancesPayload(raw);
  const row = list.find((i) => i.instanceName === instanceName);

  if (!row || row.state !== "open") {
    throw new Error(`EVOLUTION_CLOSED: ${instanceName} está ${row?.state ?? "não encontrada"}`);
  }
}
