# FlowOS — entrada para agentes (versionado no Git)

Ordem de leitura ao iniciar trabalho neste repositório:

1. **`FLOWOS-GOVERNANCE.md`** (raiz) — governo, O·P·P·P, vocabulário oficial, multitenant, FIL, suporte, roadmap, princípio do guardião.
2. **`docs/MALETA-OPERADOR.md`** — persistência de método: o que é a “maleta”, paths de skills/playbooks, limites honestos (sem memória mágica entre IAs).

Detalhe de implementação e Fortaleza (SEC-01…): se o checkout incluir **`.cursor/rules/flowos.mdc`**, seguir; senão, cumprir **P-01** (sem setor em `packages/core/`), **P-02** (`Deal.meta`), e **isolamento por `workspaceId`** em toda query ao domínio multi-tenant.

**Depuração navegação Next.js (App Router, Link, redirects, sessão):** skill  
`.cursor/skills/flowos-app-router-debug-playbook/SKILL.md` — invocação rápida: **`/bisturi`**.
