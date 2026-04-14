# Devolutiva — Fix build Playwright fora do bundle Next.js

**Data:** 2026-04-14

```
serverExternalPackages adicionado: SIM (já existia; acrescentado `electron`)
Rotas com import dinâmico / subpath sem barrel:
  - apps/web/src/app/api/deals/[id]/edital/hunt/route.ts → @flow-os/brain/workers/edital-hunter-queue
  - apps/web/src/app/api/dossier/[id]/consolidate/route.ts → dossier-consolidator-queue (sempre fila)
  - apps/web/src/app/api/public/dossier-request/route.ts → field-agent-dispatcher (deixou de importar @flow-os/brain barrel)
Novos módulos só fila (sem Playwright):
  - packages/brain/src/workers/edital-hunter-queue.ts
  - packages/brain/src/workers/dossier-consolidator-queue.ts
pnpm build local: COMPILE OK (webpack sem erros chromium-bidi/playwright). Falha final EPERM em symlinks do `standalone` no Windows — esperado; Railway/Linux não reproduz.
Deploy Railway: SUCCESS? — verificar após push (commit hash atual)
```

## Comportamento: consolidação `force`

Antes: `force: true` chamava `consolidateDossier` síncrono na API (puxava Playwright no bundle).  
Agora: **sempre enfileira** com `{ force }` no job; o worker Brain executa a mesma lógica.
