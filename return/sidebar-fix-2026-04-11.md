# Sidebar cockpit + admin workspaces — devolutiva

**Data:** 2026-04-11 (ambiente local)

## Sidebar

- **Ficheiro da navegação do portal:** `apps/web/src/app/(portal)/_components/PortalSidebar.tsx` (extraído do layout; o layout só importa este componente).
- **Layout:** `apps/web/src/app/(portal)/layout.tsx`.

## Itens adicionados / alterados

- **Leads** → `/leads` (ícone SVG utilizador)
- **Campanhas** → `/campanhas` (ícone SVG megafone)
- **Motoboys** → `/motoboys` (ícone SVG moto/entrega)
- **Dossiês** → `/dossies` (ícone SVG documento)
- **Secção:** `— Captação e dossiê —` imediatamente antes dos quatro itens acima.
- **Ordem alinhada ao menu “real”:** cockpit após Contatos; Analytics e Configurações a seguir; rótulos **Kanban**, **Chat** e **Configurações** (em vez de Pipeline / Chat WA / Settings).
- **Admin** → `/admin/workspaces`, visível **apenas** se `role === SUPER_ADMIN`.

## Rotas cockpit

- **Já existiam:** `leads/`, `campanhas/`, `motoboys/`, `dossies/` com `page.tsx` (não foram criadas páginas placeholder).

## Admin workspaces

- **Criado:** `apps/web/src/app/(portal)/admin/workspaces/page.tsx` + `AdminWorkspacesClient.tsx`.
- **API:** `POST` e `GET` em `apps/web/src/app/api/admin/workspaces/route.ts` (guard `SUPER_ADMIN`).
- **Bootstrap:** `apps/web/src/lib/workspace-bootstrap.ts` (stages + departamentos Caixa vs genérico).
- **Prisma:** valor de enum `MemberRole.SUPER_ADMIN` + migration `packages/db/prisma/migrations/20260413140000_add_member_super_admin/migration.sql`. É necessário aplicar migrations na base real.
- **Owner por email:** opcional; requer `SUPABASE_SERVICE_ROLE_KEY` + utilizador existente no Supabase Auth (resposta inclui `ownerWarning` se falhar).

## Typecheck

- `pnpm exec tsc --noEmit` em `apps/web`: **OK** (0 erros).

## Prisma generate (Windows)

- `pnpm exec prisma generate` em `packages/db` falhou com **EPERM** ao renomear `query_engine-windows.dll.node` (ficheiro provavelmente bloqueado por outro processo). O typecheck local passou; em máquinas com cliente desatualizado, voltar a correr `prisma generate` após fechar processos que usem o engine.

## Commit hash

- `d25fb92`
