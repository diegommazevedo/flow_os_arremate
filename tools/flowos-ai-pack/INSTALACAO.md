# FlowOS — AI Dev Pack v2 (instalado no repositório)

O ficheiro ZIP que recebeste continha **apenas** `flowos-ai-pack-README.md`. O restante descrito no README foi **materializado na raiz de `flow_os`** e em `tools/flowos-ai-pack/`.

## O que foi criado

| Local | Conteúdo |
|-------|-----------|
| `.cursor/mcp.json` | 8 MCPs via `node scripts/mcp-run.cjs` — lê `.env` e `.env.mcp` (sem placeholders no JSON) |
| `scripts/mcp-run.cjs` | Launcher: DATABASE_URL, tokens e chaves vêm do env |
| `.env.mcp.example` | Opcional: copiar para `.env.mcp` só para segredos MCP |
| `.cursor/cursor-mcp-rules-v2.md` | Regras MCP + triggers (colar em Cursor → Rules se quiseres duplicar) |
| `CLAUDE.md` | Memória do projeto para Claude Code |
| `.mcp.json` | Mesmos MCPs para Claude Code (path ajustável) |
| `.claude/settings.json` | Hooks PreToolUse + PostToolUse + SessionEnd |
| `.claude/hooks/` | `pre-bash-guard.sh`, `pre-write-check.sh`, `post-after-write.sh`, `session-summary.sh` |
| `.claude/agents/` | `debug.md`, `security.md` |
| `.claude/commands/` | `/debug`, `/audit`, `/security`, `/schema`, `/visual`, `/ui`, `/review`, `/deploy` |
| `tools/flowos-ai-pack/install.sh` | Copia o pack para **outro** projeto e corrige o path do `filesystem` |
| `tools/flowos-ai-pack/scripts/install-claude.sh` | Só Claude Code + `.mcp.json` |
| `tools/flowos-ai-pack/PACK_README.md` | Cópia do README original do ZIP |

### Nota sobre hooks do README

Os três hooks **post-python-lint**, **post-frontend-lint** e **post-migration-warn** foram **unificados** em `post-after-write.sh` (um único `PostToolUse`), para menos processos e timeout controlado.

## Próximos passos (manual)

1. **Cursor** — Settings → MCP: substituir `PREENCHA_SUA_KEY`, URL Postgres e token GitHub; reiniciar o Cursor.
2. **Hooks** — requerem `bash` e `jq` no PATH (Git Bash / WSL no Windows).
3. **ruff / mypy** — opcionais; o hook Python só corre se existirem.
4. **Claude Code** — `claude mcp add …` para servidores com credencial, conforme `PACK_README.md`.

## Instalar noutro repositório

```bash
bash tools/flowos-ai-pack/install.sh /caminho/absoluto/outro-repo
```

**Ferramentas usadas:** nenhum MCP; ferramentas nativas: `Write`, `StrReplace`, `Shell` (`Expand-Archive`, `Copy-Item`).
