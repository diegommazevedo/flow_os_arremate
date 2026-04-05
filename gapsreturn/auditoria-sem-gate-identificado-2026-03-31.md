AUDITORIA FlowOS — 2026-03-31 — Gate sem-gate-identificado

CRÍTICO:
- [P-01] VIOLAÇÃO DE NÚCLEO em `packages/core/` e `packages/brain/`: ocorrências proibidas detectadas em `packages/brain/src/agents/boleto-recovery.ts` (51 ocorrências; termos: `boleto`, `arrematante`, `registro`, `caixa`), `packages/brain/src/token-router.ts` (15; `caixa`, `arrematante`, `boleto`), `packages/brain/src/token-router.test.ts` (27; `arrematante`, `boleto`, `caixa`, `corretor`, `registro`), `packages/brain/src/index.ts` (2; `boleto`) e `packages/core/src/domain/types.ts` (1; `caixa`).
- [SEC-06] VIOLAÇÃO DE IMUTABILIDADE DE AUDIT LOG no código: `apps/web/src/app/api/webhooks/rocket/route.ts:453` executa `db.agentAuditLog.update(...)`, contrariando o modelo append-only do log de auditoria.

ALERTA:
- Último gate fechado não foi identificado no repositório auditado; `gapsreturn/` estava vazio antes desta execução.
- [SEC-01] Nenhum uso encontrado de `eval()`, `new Function()`, `vm.runInThisContext()` ou `exec()` em arquivos de agentes auditados.
- [SEC-02] Nenhum segredo hardcoded encontrado em arquivos `.ts` para os padrões `/sk-[a-z0-9]{20,}/`, `/Bearer [a-z0-9]{20,}/` e `/password\\s*=\\s*["'][^"']+/`.
- [SEC-03] Nenhuma query operacional `db.*.findMany({ ... })` sem `orgId` foi encontrada; a única ocorrência de `db.deal.findMany()` localizada está em comentário em `apps/web/src/app/(portal)/dashboard/page.tsx:5`.
- [SEC-06] Evidência estática de trigger encontrada: `trg_audit_immutable` é criado em `packages/db/prisma/sql/audit_immutable.sql:65`, validado no bloco `DO $$` em `packages/db/prisma/sql/audit_immutable.sql:92` e aplicado por `packages/db/prisma/setup.ts:23`; não houve comprovação runtime de execução em banco nesta auditoria estática.
- [CONSISTÊNCIA] Não havia devolutivas prévias em `gapsreturn/*.md`; nenhuma discrepância de arquivo declarado foi encontrada.

DEBT:
- Contagens globais: `any=0`, `TODO=0`, `FIXME=0`, `console.log=37`, `@ts-ignore=0`.
- `console.log` por arquivo: `packages/brain/src/token-router.ts=18`, `packages/db/prisma/seed.ts=7`, `packages/db/prisma/setup.ts=7`, `apps/web/src/app/api/webhooks/rocket/route.ts=2`, `packages/brain/src/agents/boleto-recovery.ts=2`, `packages/brain/vitest.config.ts=1`.
- Funções com mais de 50 linhas:
- `apps/web/src/app/(portal)/analytics/page.tsx:14` — `AnalyticsPage` (61 linhas)
- `apps/web/src/app/(portal)/brain/page.tsx:19` — `BrainPage` (97 linhas)
- `apps/web/src/app/(portal)/dashboard/page.tsx:18` — `DashboardPage` (96 linhas)
- `apps/web/src/app/(portal)/flows/page.tsx:44` — `FlowsPage` (52 linhas)
- `apps/web/src/app/(portal)/kanban/_components/KanbanBoard.tsx:471` — `FiltersBar` (63 linhas)
- `apps/web/src/app/(portal)/kanban/_components/KanbanBoard.tsx:542` — `FilterDropdown` (54 linhas)
- `apps/web/src/app/(portal)/kanban/_components/KanbanBoard.tsx:603` — `MobileAccordion` (66 linhas)
- `apps/web/src/app/(portal)/kanban/_components/KanbanBoard.tsx:682` — `KanbanBoard` (276 linhas)
- `apps/web/src/app/(portal)/kanban/_components/KanbanSkeleton.tsx:26` — `KanbanSkeleton` (59 linhas)
- `apps/web/src/app/(portal)/layout.tsx:15` — `PortalLayout` (58 linhas)
- `apps/web/src/app/(portal)/settings/page.tsx:20` — `SettingsPage` (103 linhas)
- `apps/web/src/app/(portal)/tasks/page.tsx:24` — `TasksPage` (58 linhas)
- `apps/web/src/app/api/sse/kanban/route.ts:14` — `GET` (78 linhas)
- `apps/web/src/app/api/webhooks/rocket/route.ts:180` — `upsertTask` (54 linhas)
- `apps/web/src/app/api/webhooks/rocket/route.ts:352` — `runBackgroundRouter` (123 linhas)
- `apps/web/src/app/api/webhooks/rocket/route.ts:480` — `POST` (147 linhas)
- `apps/web/src/app/page.tsx:3` — `LandingPage` (57 linhas)
- `packages/db/prisma/seed.ts:24` — `main` (122 linhas)
- `packages/db/prisma/setup.ts:19` — `setup` (65 linhas)
- Arquivos sem teste correspondente (40):
- `apps/web/src/app/(portal)/analytics/page.tsx`
- `apps/web/src/app/(portal)/brain/page.tsx`
- `apps/web/src/app/(portal)/contacts/page.tsx`
- `apps/web/src/app/(portal)/dashboard/page.tsx`
- `apps/web/src/app/(portal)/flows/page.tsx`
- `apps/web/src/app/(portal)/kanban/page.tsx`
- `apps/web/src/app/(portal)/kanban/_components/KanbanBoard.tsx`
- `apps/web/src/app/(portal)/kanban/_components/KanbanCard.tsx`
- `apps/web/src/app/(portal)/kanban/_components/KanbanSkeleton.tsx`
- `apps/web/src/app/(portal)/kanban/_components/types.ts`
- `apps/web/src/app/(portal)/layout.tsx`
- `apps/web/src/app/(portal)/settings/page.tsx`
- `apps/web/src/app/(portal)/tasks/page.tsx`
- `apps/web/src/app/api/sse/kanban/route.ts`
- `apps/web/src/app/api/webhooks/rocket/route.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/lib/sse-bus.ts`
- `packages/brain/src/agents/boleto-recovery.ts`
- `packages/brain/src/index.ts`
- `packages/brain/src/memory.ts`
- `packages/brain/src/models.ts`
- `packages/brain/src/runtime.ts`
- `packages/brain/src/skills/core-skills.ts`
- `packages/core/src/domain/schemas.ts`
- `packages/core/src/domain/types.ts`
- `packages/core/src/eisenhower/engine.ts`
- `packages/core/src/flow-engine/engine.ts`
- `packages/core/src/index.ts`
- `packages/core/src/kanban/engine.ts`
- `packages/core/src/security/input-sanitizer.ts`
- `packages/db/src/index.ts`
- `packages/templates/src/clinic.ts`
- `packages/templates/src/construction.ts`
- `packages/templates/src/engine.ts`
- `packages/templates/src/hospitality.ts`
- `packages/templates/src/index.ts`
- `packages/templates/src/law-firm.ts`
- `packages/templates/src/real-estate.ts`
- `packages/templates/src/real_estate_caixa.ts`

INTEGRIDADE: 100% dos arquivos declarados existem (0/0 arquivos declarados em devolutivas prévias de `gapsreturn`)

VEREDICTO: REPROVADO
