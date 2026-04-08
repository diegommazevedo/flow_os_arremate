# FlowOS — Governo arquitetural (v1)

**Versão:** 1.0 · **Âmbito:** monorepo FlowOS v4 (“O Linux dos Negócios”)

Este documento fixa **quem manda em quê** e **o que não pode ser violado** sem decisão explícita. Detalhe normativo completo continua em `docs/` e em `.cursor/rules/flowos.mdc`.

---

## 1. Hierarquia de autoridade

| Nível | Fonte | Função |
|-------|--------|--------|
| **Identidade & manifesto** | `docs/MANIFESTO.md`, `docs/NUCLEO.md` | Propósito do núcleo vs templates. |
| **Segurança** | `docs/FORTALEZA.md`, invariantes SEC-* na rule Cursor | Multi-tenant, auth, IA, PII. |
| **Templates** | `docs/TEMPLATES.md`, `packages/templates/` | Vocabulário e Zod por setor. |
| **Governança operador** | `docs/MALETA-OPERADOR.md` | Persistência de método, skills, ferramentas da ocasião. |
| **Execução** | Código em `packages/`, `apps/` | Verdade em runtime; PRs devem obedecer ao acima. |

---

## 2. Invariantes arquiteturais (resumo)

- **[P-01]** Nenhuma lógica de setor em `packages/core/`. Setor → `packages/templates/` + `Deal.meta` (JSON).
- **[P-02]** Sem colunas Prisma no núcleo para dados de setor; validar meta com Zod no template.
- **Fortaleza [SEC-01…SEC-12]** — em especial: `workspaceId` em queries, auth antes da lógica, Zod nos inputs, secrets fora do cliente, budget IA, PII fora de logs, audit append-only para agentes.

Alterar estes princípios implica **revisão explícita** (documento + PR intencional), não “drive-by”.

---

## 3. Zonas de mudança

| Zona | Política |
|------|-----------|
| **`packages/core/`** | Só evolução **agnóstica de setor** (domínio, Eisenhower, Kanban, Flow Engine). |
| **`packages/db/prisma/`** | Schema **universal**; extensões de setor só via `meta` ou campos genuinamente universais. |
| **`packages/brain/`** | Runtime IA, skills, memória — sem vazar setor para o núcleo de domínio. |
| **`packages/templates/`** | Todo vocabulário e regras por setor. |
| **`apps/web/`** | Portal, rotas, UI; obedece a sessão, workspace e Fortaleza. |

---

## 4. Operador e continuidade

- Regras Cursor: `.cursor/rules/flowos.mdc` (+ regras de contexto em `.cursor/rules/*.mdc`).
- Playbook de depuração App Router: `.cursor/skills/flowos-app-router-debug-playbook/SKILL.md`.
- **Maleta:** ver `docs/MALETA-OPERADOR.md` — o que não está versionado ou injectado não persiste entre sessões de IA.

---

## 5. Revisão deste documento

- **v1.0:** governo mínimo alinhado ao estado actual do repositório.
- Incrementos futuros: RACI por pacote, política de versão de API pública do núcleo, critérios de major do schema DB — quando o projeto exigir.

---

*FlowOS v4 — documento de governo arquitetural. Não substitui o texto integral de FORTALEZA nem as rules do Cursor.*
