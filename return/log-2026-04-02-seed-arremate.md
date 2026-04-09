# Log — Seed idempotente Arremate (`seed:arremate`)

**Fonte:** devolutiva Cursor (execução + desenho do script).

## Artefacto

- Ficheiro: `packages/db/seeds/arremate-config.ts`
- Comando: `pnpm --filter @flow-os/db seed:arremate`
- `WORKSPACE_ID` ou `ARREMATE_WORKSPACE_ID`, ou argumento: `pnpm --filter @flow-os/db run seed:arremate -- "<uuid>"`

## Comportamento acordado

- Transação única (`$transaction`).
- Todas as mutações com `workspaceId` explícito; updates de `Stage` via `updateMany({ where: { id, workspaceId } })` onde aplicável.
- Estágios: bump temporário de **todas** as linhas `Stage` do workspace (`position = 1_000_000 + k`) para respeitar `@@unique([workspaceId, position])`; depois pipeline **1–12** por nome.
- `slaDays`: 7 nas posições 1–4, 15 nas restantes (pipeline).
- `isWon`: **apenas** "Arrematação" (último estágio).
- Departamentos (upsert `workspaceId_nome`): Contrato, ITBI, Registro, Condomínio / Gestão, Operações — `membros: []`.
- Tags (upsert `workspaceId_descricao`): Cliente não responde, Inadimplente, ITBI pendente, Docs ok, Urgente — cores semânticas.
- Estágios **fora** da lista dos 12 **não são apagados**; ficam com `position` alta (ruído esperado no Kanban).

## `package.json`

```json
"seed:arremate": "tsx seeds/arremate-config.ts"
```

## Nota local (Windows)

Ao correr a partir da raiz do monorepo, garantir `DATABASE_URL` (o `tsx` não carrega automaticamente `packages/db/.env`). Opção: `cd packages/db` + `.env`, ou exportar `DATABASE_URL` na sessão.

## Produção

Repetir com **UUID real** do workspace Bruno e `DATABASE_URL` Railway/Supabase.
