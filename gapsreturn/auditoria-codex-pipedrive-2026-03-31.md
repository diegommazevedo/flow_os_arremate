AUDITORIA FlowOS — Pós Engenharia Reversa Pipedrive — 2026-03-31

CRÍTICO (bloqueia tudo):
- [P-01] Violação de núcleo confirmada em `packages/brain/` e `packages/core/`. Evidências: `packages/brain/src/index.ts:23`, `packages/brain/src/worker-entrypoint.ts:10`, `packages/brain/src/agents/boleto-recovery.ts:42`, `packages/brain/src/agents/relatorio-imovel.ts:399`, `packages/brain/src/workers/rpa-caixa.ts:2`, `packages/core/src/domain/types.ts:28`. O núcleo e o brain continuam conhecendo termos/setor imobiliário/caixa fora de `packages/templates/`.
- [SEC-03] Risco crítico cross-tenant em `apps/web/src/app/api/portal/upload-document/route.ts:105-107`: a busca do deal é feita por `id` puro, sem `workspaceId`, e só depois ocorre validação de autorização. Isso permite oracle de existência entre workspaces (`404` vs `403`) e usa metadados do deal antes do escopo estar garantido.
- [SEC-03] Risco crítico cross-tenant em `apps/web/src/app/api/tasks/create/route.ts:50-73`: a rota aceita `dealId` externo e cria a task sem verificar se o deal pertence ao `workspaceId` da sessão. Como o retorno inclui `deal.contact`, um `dealId` de outro tenant pode vazar título/nome/email/telefone no response.

ALERTA (corrigir antes do próximo prompt):
- [SEC-08] Sanitização central não está sendo aplicada nos novos handlers de formulário. Entradas externas são persistidas sem `InputSanitizer` em `apps/web/src/app/api/deals/create/route.ts:31-71`, `apps/web/src/app/api/deals/[id]/route.ts:46-107`, `apps/web/src/app/api/deals/[id]/notes/route.ts:46-68`, `apps/web/src/app/api/tasks/create/route.ts:30-63`, `apps/web/src/app/api/filters/route.ts:32-46` e `apps/web/src/app/api/portal/upload-document/route.ts:72-180`.
- [SEC-08] `packages/db/scripts/migrate-pipedrive.ts` sanitiza CSV com função local `sanitize()` (`packages/db/scripts/migrate-pipedrive.ts:82-89` e `124-150`), mas não usa o `InputSanitizer` canônico do manifesto. Está parcialmente mitigado, porém fora do padrão inviolável.
- [TYPESCRIPT] `pnpm typecheck` do monorepo ainda falha por erros remanescentes fora do delta principal: `packages/templates/src/engine.ts:2` e reexports de `packages/core/src/index.ts` (TS6059/rootDir), `packages/core/src/security/encrypt.ts:14` e correlatos (tipos Node ausentes), `packages/brain/vitest.config.ts:1` via `packages/brain/tsconfig.json` (TS6059/rootDir) e `packages/db/prisma/setup.ts:16` (`import.meta` em saída CommonJS).

DEBT (pode continuar mas registrar):
- [P-02] Sem violação arquitetural nova detectada: as mudanças de setor foram mantidas em `Deal.meta` e os novos artefatos de schema (`DealNote`, `SavedFilter`, `Task.priority`, `Task.type`) são genéricos, não colunas específicas do setor.
- [SEC-06] Nenhuma ocorrência de `auditLog.update()`, `auditLog.delete()`, `agentAuditLog.update()` ou `agentAuditLog.delete()` foi encontrada nos arquivos auditados; o padrão observado continua append-only com `create()`.
- [PRISMA] `prisma validate` passou e o schema atual é válido. Pela inspeção do `schema.prisma`, as alterações são aditivas; não há indício atual de drop de tabela/coluna no estado versionado.

CONSISTÊNCIA:
- 26 de 26 arquivos declarados existem no filesystem e têm conteúdo não vazio.

TYPECHECK: LIMPO para o delta do upgrade no `apps/web` (0 erros novos). O `pnpm typecheck` do monorepo ainda falha por erros pré-existentes fora do escopo listados acima.
PRISMA: VÁLIDO

VEREDICTO: REPROVADO