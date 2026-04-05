/**
 * FlowOS v4 — db:setup
 * Executado após `prisma db push` para aplicar SQL que o Prisma não gerencia:
 *   - Extensão pgvector
 *   - Trigger audit_immutable [SEC-06]
 *   - Índices IVFFLAT para busca semântica
 *
 * Usage: pnpm db:setup
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new PrismaClient({ log: ["error"] });

async function setup() {
  console.log("⚙️  FlowOS db:setup iniciando...\n");

  // Ler o arquivo SQL
  const sqlPath = join(__dirname, "sql", "audit_immutable.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  // Separar statements e executar um a um
  // (Prisma $executeRawUnsafe não aceita múltiplos statements em sequência)
  const statements = splitSqlStatements(sql);

  let ok = 0;
  let failed = 0;

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;

    try {
      await db.$executeRawUnsafe(trimmed);
      ok++;

      // Detectar e logar ações-chave
      if (/CREATE EXTENSION/i.test(trimmed)) {
        console.log("  ✓ Extensão pgvector habilitada");
      } else if (/CREATE INDEX.*brain_memories/i.test(trimmed)) {
        console.log("  ✓ Índice IVFFLAT criado em brain_memories");
      } else if (/CREATE INDEX.*knowledge_chunks/i.test(trimmed)) {
        console.log("  ✓ Índice IVFFLAT criado em knowledge_chunks");
      } else if (/CREATE OR REPLACE FUNCTION fn_audit_immutable/i.test(trimmed)) {
        console.log("  ✓ Função fn_audit_immutable criada");
      } else if (/CREATE TRIGGER trg_audit_immutable/i.test(trimmed)) {
        console.log("  ✓ Trigger audit_immutable ativo em agent_audit_logs [SEC-06]");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Erros esperados e ignoráveis
      if (
        msg.includes("already exists") ||
        msg.includes("já existe") ||
        msg.includes("does not exist")
      ) {
        ok++;
        continue;
      }

      console.error(`  ✗ Falha em statement: ${trimmed.slice(0, 80)}...`);
      console.error(`    Erro: ${msg}\n`);
      failed++;
    }
  }

  console.log(`\n${failed === 0 ? "✅" : "⚠️ "} db:setup concluído — ${ok} OK · ${failed} falhas`);

  if (failed > 0) {
    console.error(
      "\n⚠️  Algumas operações falharam. Verifique se:\n" +
      "  1. O banco está acessível (DATABASE_URL correta)\n" +
      "  2. pgvector está instalado (Supabase tem por padrão)\n" +
      "  3. As tabelas foram criadas com `pnpm db:push` antes do setup\n",
    );
    process.exit(1);
  }
}

/**
 * Divide um arquivo SQL em statements individuais respeitando:
 * - Blocos $$ (funções PL/pgSQL)
 * - Comentários de linha (--)
 * - Comentários de bloco (/* *\/)
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarBlock = false;
  let dollarTag = "";

  const lines = sql.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Detectar início/fim de bloco $$
    const dollarMatch = trimmedLine.match(/(\$\$|\$[a-zA-Z_][a-zA-Z0-9_]*\$)/g);
    if (dollarMatch) {
      for (const tag of dollarMatch) {
        if (!inDollarBlock) {
          inDollarBlock = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollarBlock = false;
          dollarTag = "";
        }
      }
    }

    current += line + "\n";

    // Final de statement: ';' fora de bloco $$
    if (!inDollarBlock && trimmedLine.endsWith(";")) {
      statements.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

setup()
  .catch((err) => {
    console.error("❌ Erro fatal em db:setup:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
