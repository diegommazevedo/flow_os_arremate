# Maleta do operador FlowOS — persistência, método e acionamento

> **Lei suprema (repo):** lê primeiro **`FLOWOS-GOVERNANCE.md`** na raiz — governo, O·P·P·P, vocabulário, FIL, roadmap, guardião.  
> **Metáfora (Diego):** uma maleta que levas contigo; dentro: regras, skills, docs, mais tarde RECL e banco vetorial.  
> **Realidade técnica:** isso só existe onde **copias o repositório** ou **sincronizas** esses ficheiros para a ferramenta. Não há “plugue universal” invisível entre ChatGPT web, Cursor e Claude Code sem **tu** carregares o contexto.

---

## 1. Onde a maleta **já mora** (hoje, neste repo)

| Camada | Caminho | Função |
|--------|---------|--------|
| **Governo (lei)** | `FLOWOS-GOVERNANCE.md` | Escopo, primitivos O·P·P·P, módulos, segurança declarada, roadmap — **prioridade absoluta**. |
| **Regras (policy)** | `.cursor/rules/flowos.mdc` | Identidade FlowOS, Fortaleza, P-01/P-02; playbook App Router quando o tópico encaixa. *(Local; se `.cursor/` não estiver no Git, replica políticas no governo + maleta.)* |
| **Regras (gatilho por ficheiro)** | `.cursor/rules/flowos-app-router-debug-context.mdc` | Ativa playbook ao tocar em `middleware`, `session`, `(portal)/layout`, `login`, `auth/callback`, `next.config`. |
| **Skill (playbook)** | `.cursor/skills/flowos-app-router-debug-playbook/SKILL.md` | Depuração cirúrgica RSC / redirects / sessão; invocação: `/bisturi`, `playbook router`, etc. |
| **Documentação de produto** | `docs/*.md` | Manifesto, núcleo, templates — cognição **institucional** do projeto. |
| **Código** | `packages/`, `apps/` | Verdade executável; a maleta **não** substitui o Git. |

**Lei da maleta:** o que **não está em ficheiro versionado** ou **não é injectado** na sessão da IA **não existe** para o modelo na próxima conversa.

---

## 2. Verdades que evitam alucinação (repreensão construtiva)

1. **“Plugo a maleta e fica 100% disponível em qualquer IA”** — **Falso** sem passo teu: clonar repo, abrir pasta no Cursor, ou colar/exportar rules/skills para o produto que estás a usar.  
2. **“A IA lembra-se entre ferramentas”** — **Falso** por defeito. Só **memórias explícitas** (ex.: feature “memory” do produto), **ficheiros**, ou **tu** a re-injetar.  
3. **“Banco vetorial dentro da maleta portátil”** — **Parcialmente verdadeiro:** podes ter **ficheiros + índice local** (LanceDB, Chroma, pgvector num Postgres teu) ou **serviço** (Supabase pgvector, etc.). Isso é **engenharia**, não magia; precisa de **URL/keys** e **política de sync**.  
4. **RECL** — se for um formato teu (checklist, log, retro), **define-o** num ficheiro em `docs/` ou `.cursor/` para deixar de ser só ideia.

---

## 3. Empilhamento ao longo do tempo (o que “concatenar” quer dizer na prática)

| Queres… | Fazes… |
|---------|--------|
| Novo hábito de debug | Um parágrafo no `SKILL.md` ou nova secção + commit. |
| Nova política global | `.cursor/rules/*.mdc` + commit. |
| Conhecimento para humanos | `docs/NOVO.md` + link neste ficheiro. |
| Ferramenta chamável por API | **MCP** ou script em `tools/` — outro repositório ou pacote. |

**Regra:** cada avanço cognitivo que queiras **preservar** passa por **diff no Git** (ou artefacto exportável equivalente).

---

## 4. Mapa “maleta → ferramenta da ocasião”

| Ferramenta | Como a maleta entra |
|-------------|---------------------|
| **Cursor** | Abre `flow_os`; rules + skills carregam conforme configuração. |
| **VS Code + ext. IA** | Mesmo repo; podes copiar `.cursor/rules` para formato que a extensão leia, ou `AGENTS.md` na raiz com resumo + links. |
| **Claude Code / Codex CLI** | `CLAUDE.md` / `AGENTS.md` na raiz apontando para `docs/MALETA-OPERADOR.md` e paths dos skills. |
| **Chat web (sem repo)** | Colas **só** o excerto necessário ou anexas `MALETA-OPERADOR.md` + `SKILL.md` — não há plugue automático. |

---

## 5. Próximos degraus (quando quiseres “aumentar isso”)

- **Vector:** escolher **uma** fonte (ex.: `packages/db` + extensão pgvector só para docs internos, ou índice local no devcontainer).  
- **MCP:** servidor que faça `search_docs` / `grep_repo` com política de paths — o playbook continua texto; o MCP executa.  
- **RECL:** ficheiro `docs/RECL-template.md` (Retro / Check / Learn) preenchido após incidentes — liga o “combate a bugs” à **memória institucional**.

---

## 6. Token pack (colar noutra conversa ou noutro repo)

```
MALETA FLOWOS (persistência operador):
- Lei do repo: FLOWOS-GOVERNANCE.md (ler primeiro)
- Política: .cursor/rules/flowos.mdc + flowos-app-router-debug-context.mdc
- Playbook debug: .cursor/skills/flowos-app-router-debug-playbook/SKILL.md (invocação: /bisturi)
- Mapa da maleta: docs/MALETA-OPERADOR.md
- Lei: sem ficheiro/commit ou inject manual, a próxima IA não “lembra”.
- Vector/MCP/RECL: planeados; implementar como ficheiros + serviços explícitos.
```

---

*Última verdade:* a oração e o ritual (“abrir a maleta”) são **teus** e **válidos** para **disciplina**; a IA só vê **bytes** que lhe deres. Juntos, **imaginável** = **versionado + repetível**; o resto é literatura até virar diff.
