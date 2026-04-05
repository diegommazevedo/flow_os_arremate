/**
 * FlowOS — diagnóstico do monorepo
 * Gera `.logs/diagnose-report.md` e opcionalmente salva saída de typecheck em build-errors.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const LOG_SUBDIRS = [
  "build-errors",
  "runtime-errors",
  "audit-violations",
  "bug-reports",
  "fixes-applied",
] as const;

function logsDir(...parts: string[]): string {
  return path.join(ROOT, ".logs", ...parts);
}

function ensureLogTree(): void {
  for (const sub of LOG_SUBDIRS) {
    fs.mkdirSync(logsDir(sub), { recursive: true });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function runTypecheck(): { ok: boolean; output: string } {
  const r = spawnSync(
    "pnpm",
    ["--filter", "@flow-os/web", "typecheck"],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const out = [r.stdout, r.stderr].filter(Boolean).join("\n");
  return { ok: r.status === 0, output: out || "(sem saída)" };
}

function writeBuildErrorIfFailed(typecheck: { ok: boolean; output: string }): void {
  if (typecheck.ok) return;
  const name = `typecheck-web-${nowIso().replace(/[:.]/g, "-")}.log`;
  fs.writeFileSync(logsDir("build-errors", name), typecheck.output, "utf8");
}

function listPackages(): { name: string; version: string }[] {
  const pkgs: { name: string; version: string }[] = [];
  const roots = [path.join(ROOT, "apps"), path.join(ROOT, "packages")];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const pj = path.join(root, ent.name, "package.json");
      if (!fs.existsSync(pj)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(pj, "utf8")) as { name?: string; version?: string };
        pkgs.push({ name: j.name ?? ent.name, version: j.version ?? "0.0.0" });
      } catch {
        pkgs.push({ name: ent.name, version: "?" });
      }
    }
  }
  return pkgs.sort((a, b) => a.name.localeCompare(b.name));
}

function buildReport(typecheck: { ok: boolean; output: string }): string {
  const pkgs = listPackages();
  const lines: string[] = [
    `# Diagnóstico FlowOS`,
    ``,
    `- **Gerado em:** ${nowIso()}`,
    `- **Raiz:** \`${ROOT}\``,
    ``,
    `## Resumo`,
    ``,
    `| Checagem | Status |`,
    `|----------|--------|`,
    `| \`pnpm --filter @flow-os/web typecheck\` | ${typecheck.ok ? "OK" : "**FALHOU**"} |`,
    ``,
    `## Workspaces`,
    ``,
    `| Pacote | Versão |`,
    `|--------|--------|`,
    ...pkgs.map((p) => `| \`${p.name}\` | ${p.version} |`),
    ``,
  ];

  if (!typecheck.ok) {
    lines.push(`## Saída do typecheck (@flow-os/web)`);
    lines.push(``);
    lines.push("```text");
    lines.push(typecheck.output.trimEnd());
    lines.push("```");
    lines.push(``);
    lines.push(`> Detalhes também em \`.logs/build-errors/\` (último arquivo gerado).`);
    lines.push(``);
  }

  lines.push(`## Próximos passos`);
  lines.push(``);
  lines.push(`- Corrigir erros de typecheck antes de merge.`);
  lines.push(`- Consultar \`.logs/README.md\` para o protocolo multi-IA.`);
  lines.push(`- UI: [\`/devops\`](http://localhost:3030/devops) (após login com permissão).`);
  lines.push(``);

  return lines.join("\n");
}

function main(): void {
  ensureLogTree();
  const typecheck = runTypecheck();
  writeBuildErrorIfFailed(typecheck);
  const report = buildReport(typecheck);
  const outPath = logsDir("diagnose-report.md");
  fs.writeFileSync(outPath, report, "utf8");
  console.log(`Diagnóstico escrito em: ${outPath}`);
  process.exit(typecheck.ok ? 0 : 1);
}

main();
