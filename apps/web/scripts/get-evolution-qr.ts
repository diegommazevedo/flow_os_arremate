/**
 * FlowOS — Get Evolution API QR Code
 * Gera QR fresco, salva em .logs/evolution-qr-fresh.png e abre automaticamente.
 *
 * Uso:
 *   pnpm get:qr
 *   pnpm get:qr --instance minha-instancia
 *   EVOLUTION_INSTANCE_NAME=outra pnpm get:qr
 */

import fs   from "fs";
import path from "path";

const API_URL  = process.env["EVOLUTION_API_URL"]      ?? "http://localhost:8080";
const API_KEY  = process.env["EVOLUTION_API_KEY"]       ?? "flowos-evolution-2026";
const INSTANCE = process.env["EVOLUTION_INSTANCE_NAME"] ?? "arrematador-01";
const OUT_PATH = path.join(process.cwd(), "..", "..", ".logs", "evolution-qr-fresh.png");

async function fetchQR(instance: string): Promise<{ base64?: string; count?: number; pairingCode?: string | null }> {
  const res = await fetch(`${API_URL}/instance/connect/${instance}`, {
    headers: { apikey: API_KEY },
  });
  if (!res.ok) throw new Error(`Evolution API respondeu ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ base64?: string; count?: number; pairingCode?: string | null }>;
}

async function restartInstance(instance: string): Promise<void> {
  // Evolution v2.x usa POST para restart/reconnect
  await fetch(`${API_URL}/instance/restart/${instance}`, {
    method: "POST",
    headers: { apikey: API_KEY },
  });
}

function saveQR(base64: string): void {
  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, buf);
}

async function main(): Promise<void> {
  console.log(`\n🔍 Instância: ${INSTANCE}`);
  console.log(`   API: ${API_URL}\n`);

  let data = await fetchQR(INSTANCE);

  if (!data.base64 && (data.count === 0 || data.count === undefined)) {
    console.log("⏳ QR não disponível — reiniciando instância...");
    await restartInstance(INSTANCE);

    console.log("   Aguardando 10s para Baileys reconectar...");
    await new Promise((r) => setTimeout(r, 10_000));

    data = await fetchQR(INSTANCE);
  }

  if (data.base64) {
    saveQR(data.base64);
    console.log(`✅ QR salvo em: ${OUT_PATH}`);
    console.log(`\n⚠️  ATENÇÃO: QR expira em ~60 segundos!`);
    console.log(`   Abra o arquivo e escaneie com o WhatsApp agora.\n`);

    // Tentar abrir automaticamente no Windows/Mac/Linux
    const { platform } = process;
    const { execSync } = await import("child_process");
    try {
      if (platform === "win32") execSync(`start "" "${OUT_PATH}"`, { stdio: "ignore" });
      else if (platform === "darwin") execSync(`open "${OUT_PATH}"`, { stdio: "ignore" });
      else execSync(`xdg-open "${OUT_PATH}"`, { stdio: "ignore" });
      console.log("   (arquivo aberto automaticamente)\n");
    } catch {
      console.log(`   Abrir manualmente: ${OUT_PATH}\n`);
    }
  } else if (data.count === 1) {
    console.log("ℹ️  Instância já tem QR ativo (count=1). Tentando restart para gerar novo...");
    await restartInstance(INSTANCE);
    await new Promise((r) => setTimeout(r, 10_000));

    const data2 = await fetchQR(INSTANCE);
    if (data2.base64) {
      saveQR(data2.base64);
      console.log(`✅ QR salvo em: ${OUT_PATH}`);
      console.log(`⚠️  Escaneie agora — expira em ~60s!\n`);
    } else {
      console.log("❌ QR não obtido. Estado:", JSON.stringify(data2));
      console.log("   Verifique o container: docker logs flow_os-evolution-1");
    }
  } else {
    console.log("❌ Resposta inesperada:", JSON.stringify(data));
    console.log("   Verifique: docker ps | grep evolution");
  }
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
