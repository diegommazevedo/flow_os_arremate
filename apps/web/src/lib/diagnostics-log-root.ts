/**
 * Caminho da pasta `.logs` na raiz do monorepo (a partir de apps/web).
 */
import path from "node:path";

export function getMonorepoLogsRoot(): string {
  const cwd = process.cwd();
  return path.resolve(cwd, "..", "..", ".logs");
}
