# Devolutiva — pedido: frame + `.md` a cada prompt

**Data:** 2026-04-14  
**Tipo:** regra de processo + registo da última intervenção relevante (404 cockpit)

---

## Frame (copiar / colar)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  DEVOLUTIVA — FlowOS · Cursor · 2026-04-14                                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  PEDIDO DO UTILIZADOR                                                        ║
║  • Sempre: devolutiva em FRAME (texto copiável) + ficheiro .md gravado.      ║
║  • Não depender só da resposta no chat.                                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  ONDE GRAVAR                                                                 ║
║  • Repo:     return/devolutiva-YYYY-MM-DD-prompt.md (ou nome acordado)       ║
║  • Handoff:  C:\dev\return\devolutiva-YYYY-MM-DD-prompt.md                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  CONTEXTO RECENTE (404 cockpit)                                              ║
║  • Causa: páginas cockpit untracked → Railway sem ficheiros → 404.           ║
║  • Fix: commit bbd1430 + push — portal/(leads|campanhas|motoboys|dossies) +   ║
║    APIs associadas + TagSelector + libs.                                     ║
║  • ls local: pastas corretas em (portal) com page.tsx (não era A nem B).    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  PRÓXIMO PASSO                                                               ║
║  • Confirmar deploy Railway do bbd1430; testar rotas.                        ║
║  • Em cada prompt seguinte: repetir frame + .md (este formato).             ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Corpo (markdown)

### Regra acordada

A partir deste pedido, em **cada** resposta materialmente relevante (feature, deploy, diagnóstico, sprint):

1. Incluir no **chat** um bloco **FRAME** (ASCII) com resumo acionável.
2. Gravar `**return/devolutiva-AAAA-MM-DD-*.md`** (nome curto por sessão/tema).
3. Espelhar em `**C:\dev\return\`** o mesmo ficheiro para handoff fora do git.

### Ficheiros desta devolutiva


| Local       | Caminho                                         |
| ----------- | ----------------------------------------------- |
| Repositório | `return/devolutiva-2026-04-14-prompt.md`        |
| Handoff     | `C:\dev\return\devolutiva-2026-04-14-prompt.md` |


### Referência técnica rápida

- Commit cockpit no git: `**bbd1430**` (`feat(web): páginas cockpit no grupo (portal) + APIs...`).
- `LeadsTable` + `GET /api/leads` já estavam em `**d47ee90**`; faltavam as `page.tsx` e restantes rotas/APIs até ao `**bbd1430**`.

---

## Atualização — auditoria pré-deploy (2026-04-14 · fusão S8/S9)

```
╔══════════════════════════════════════════════════════════════════╗
║  AUDITORIA PRÉ-DEPLOY — APROVADA ✅                             ║
╠══════════════════════════════════════════════════════════════════╣
║  Dispatcher: sem conflito — camadas compostas corretamente      ║
║    workflow  → baseline (templates, agentLimit, price padrão)   ║
║    profile   → overlay (território, bandeirada, skip, teto)     ║
║    effective → composição (mínimo entre limites válidos)        ║
║  Erros TS: corrigidos — typecheck @flow-os/web exit 0           ║
║  dossier-generator + rpa-caixa: legados resolvidos              ║
╚══════════════════════════════════════════════════════════════════╝
```

- **Commit:** `0070f08` — `fix(predeploy): TS errors + dispatcher audit + backfill script` — **push `main` OK** (`origin/main`).
- **Railway:** confirmar **SUCCESS** do deploy deste commit no dashboard (não verificável a partir do repo).
- **Pós-deploy (ordem):** `prisma migrate deploy` (schema `packages/db/prisma/schema.prisma`) → `seed-field-workflow.ts` → `pnpm --filter @flow-os/db run backfill:mission-profiles`.
- **Nota:** staging intencional — **não** incluídos `evolution_api.txt`, PNGs de teste, `.playwright-mcp/`, etc.; rever `git status` para o resto untracked.

---

*Política: frame no chat + .md em `return/` e `C:\dev\return\` por prompt com trabalho entregue.*