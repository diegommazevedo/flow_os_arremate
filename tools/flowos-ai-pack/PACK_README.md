# FlowOS · Agroflux — AI Dev Pack v2.0
## Cursor MCP Rules + Claude Code Pack — instalação em um comando

---

## Estrutura do pacote

```
flowos-ai-pack/
│
├── install.sh                        ← instalador mestre (roda tudo)
│
├── cursor/
│   └── cursor-mcp-rules-v2.md       ← cole em Cursor → Settings → Rules for AI
│
└── claude-code/
    ├── CLAUDE.md                     ← memória persistente do agente
    ├── .mcp.json                     ← 8 MCPs configurados
    ├── scripts/install.sh            ← instalador isolado só do Claude Code
    └── .claude/
        ├── settings.json             ← hooks automáticos + permissões
        ├── agents/
        │   ├── debug.md              ← agente de debug (Sequential Thinking)
        │   └── security.md           ← agente 12-point fortress
        ├── commands/
        │   ├── debug.md   → /debug
        │   ├── audit.md   → /audit
        │   ├── security.md→ /security
        │   ├── schema.md  → /schema
        │   ├── visual.md  → /visual
        │   ├── ui.md      → /ui
        │   ├── review.md  → /review
        │   └── deploy.md  → /deploy
        └── hooks/
            ├── pre-bash-guard.sh       ← bloqueia rm -rf, DROP TABLE, curl|bash
            ├── pre-write-check.sh      ← bloqueia secrets hardcoded
            ├── post-python-lint.sh     ← ruff + mypy automático
            ├── post-frontend-lint.sh   ← eslint + tsc automático
            ├── post-migration-warn.sh  ← aviso crítico em migrations
            └── session-summary.sh      ← log automático de sessão
```

---

## Instalação — um comando

```bash
# Extraia o pacote
tar -xzf flowos-ai-pack.tar.gz
cd flowos-ai-pack

# Instale no projeto
bash install.sh /caminho/absoluto/do/projeto

# Exemplo
bash install.sh /Users/diego/projetos/agroflux
```

O instalador faz tudo automaticamente:
- Verifica Node.js >= 18 e instala Claude Code CLI se necessário
- Copia `cursor-mcp-rules-v2.md` para o projeto
- Gera `.cursor/mcp.json` com o path do projeto já configurado
- Copia `CLAUDE.md`, `.mcp.json`, agents, commands e hooks
- Aplica `chmod +x` nos hooks
- Registra os 5 MCPs sem credencial via `claude mcp add`
- Atualiza o `.gitignore`

---

## Credenciais necessárias (após instalação)

### Cursor → `.cursor/mcp.json`
| Campo | Onde obter |
|---|---|
| `PREENCHA_SUA_KEY` (21st Magic) | https://21st.dev/magic/console |
| `DB_USER / DB_PASS / DB_HOST / DB_NAME` | Suas variáveis de ambiente |
| `PREENCHA_SEU_TOKEN` (GitHub) | https://github.com/settings/tokens |

### Claude Code → via terminal após `claude mcp add`
```bash
# 21st Magic
claude mcp add 21st-magic npx -y @21st-dev/magic@latest API_KEY="SUA_KEY"

# PostgreSQL
claude mcp add postgres npx -y @modelcontextprotocol/server-postgres \
  postgresql://USER:PASS@HOST:5432/DBNAME

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN="SEU_TOKEN" \
claude mcp add github npx -y @modelcontextprotocol/server-github
```

---

## MCPs instalados (8 servidores)

| MCP | Cursor | Claude Code | Função | Custo |
|---|:---:|:---:|---|---|
| Context7 | ✅ | ✅ | Docs oficiais em tempo real — elimina alucinações de API | Free |
| Sequential Thinking | ✅ | ✅ | Raciocínio multi-etapa antes de código | Free |
| 21st Magic | ✅ | ✅ | Componentes React profissionais via `/ui` | Free (beta) |
| Playwright | ✅ | ✅ | Browser automation + auditoria visual | Free |
| Filesystem | ✅ | ✅ | Auditoria estrutural com escopo controlado | Free |
| PostgreSQL | ✅ | ✅ | Validação de schema e queries em tempo real | Free |
| GitHub | ✅ | ✅ | Code review, PRs, blame, rastreio | Free |
| Semgrep | ✅ | ✅ | SAST OWASP: SQLi, XSS, secrets, endpoints | Free (OSS) |

---

## Hooks automáticos (só Claude Code)

Disparam sem você pedir. São determinísticos — não podem ser ignorados.

| Hook | Evento | Ação |
|---|---|---|
| `pre-bash-guard` | Antes de bash | Bloqueia (exit 2): `rm -rf /`, `DROP TABLE`, `curl\|bash`, `chmod 777` |
| `pre-write-check` | Antes de salvar arquivo | Bloqueia (exit 2): secrets hardcoded (API keys, passwords, tokens, PEM) |
| `post-python-lint` | Após escrever `.py` | Roda `ruff check` + `mypy` — reporta issues ao agente |
| `post-frontend-lint` | Após escrever `.ts/.tsx` | Roda `eslint` + `tsc --noEmit` — reporta issues ao agente |
| `post-migration-warn` | Após escrever migration | Aviso crítico com checklist antes de `alembic upgrade` |
| `session-summary` | Ao encerrar sessão | Salva log em `.claude/session-logs/YYYY-MM-DD.log` |

---

## Comandos slash (Claude Code)

| Comando | O que faz |
|---|---|
| `/debug [descrição]` | Protocolo 6 etapas: Sequential Thinking → Filesystem → Context7 → PostgreSQL → Fix → Confirma |
| `/audit` | Auditoria completa: estrutura, débito técnico, banco, segurança |
| `/security` | Scan OWASP — 12 pontos do fortress. Bloqueante se VERMELHO |
| `/schema` | Tabelas, índices, migrations pendentes, integridade referencial |
| `/visual [rota]` | Playwright: screenshot + interações + mobile 375px |
| `/ui [descrição]` | 21st Magic → Context7 → Playwright (gerar + validar componente) |
| `/review [PR]` | Code review em 5 dimensões: lógica, qualidade, segurança, performance, testes |
| `/deploy` | Checklist 25 itens / 6 blocos. Bloqueia se B ou D falhar |

---

## Diferença entre Cursor e Claude Code

| Aspecto | Cursor | Claude Code |
|---|---|---|
| Interface | IDE visual | Terminal |
| Rules | Sugestões (agente pode ignorar) | CLAUDE.md = memória real |
| Hooks | Não tem | Scripts bash determinísticos |
| Agentes | Não tem | Subagentes com contexto isolado |
| Slash commands | Não tem | /debug /audit /deploy etc |
| MCPs | Via `.cursor/mcp.json` | Via `claude mcp add` |
| Melhor para | UI, edição visual, autocompletar | Tarefas longas, automação, CI |

**Workflow ideal:** Use Cursor para edição e geração de código. Use Claude Code para debug profundo, auditoria, deploy check e tarefas que exigem múltiplos MCPs encadeados.

---

## Verificar instalação

```bash
# Claude Code
cd /seu/projeto
claude
# Dentro do Claude Code:
/audit

# Cursor
# Settings → MCP → verificar status verde nos 8 servidores
```

---

## O que commitar no git

```
✅ COMMITAR:
  CLAUDE.md
  .mcp.json           (sem credenciais hardcoded — use placeholders)
  .cursor/mcp.json    (sem credenciais hardcoded — use placeholders)
  .claude/settings.json
  .claude/agents/
  .claude/commands/
  .claude/hooks/

❌ NÃO COMMITAR:
  .env  *.env  .env.local
  .claude/session-logs/
  .claude/settings.local.json
```

---

*FlowOS · Agroflux — AI Dev Pack v2.0*
*Cursor MCP Rules + Claude Code Pack*
*"Docs-first. Security-structural. Visual-confirmed."*
