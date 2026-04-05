import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    // Mostra console.log dos testes (necessário para imprimir RouterDecision)
    silent:      false,
    reporters:   ["verbose"],
  },
  resolve: {
    alias: {
      "@flow-os/core": path.resolve(__dirname, "../core/src/index.ts"),
      "@flow-os/db":   path.resolve(__dirname, "../db/src/index.ts"),
    },
  },
});
