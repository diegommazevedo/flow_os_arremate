# Log — Pré-flight SQL (nomes reais Prisma / Postgres)

**Fonte:** devolutiva Cursor (correção do checklist).

## Workspace — tabela **`workspaces`** (não `"Workspace"`)

```sql
SELECT id, name, slug
FROM "workspaces"
WHERE slug ILIKE '%arremate%'
   OR name ILIKE '%bruno%'
   OR name ILIKE '%arremate%'
LIMIT 5;
```

## Validação pós-seed

Tabelas mapeadas: `stages`, `departments`, `chat_tags`.  
`Department` usa coluna **`nome`**. `ChatTag` usa **`descricao`**, **`corFundo`**, **`ordem`**.

```sql
SELECT name, position, "slaDays", "isWon"
FROM "stages"
WHERE "workspaceId" = 'uuid-aqui'
ORDER BY position;

SELECT nome FROM "departments"
WHERE "workspaceId" = 'uuid-aqui'
ORDER BY nome;

SELECT descricao, "corFundo", ordem
FROM "chat_tags"
WHERE "workspaceId" = 'uuid-aqui'
ORDER BY ordem;
```

**Esperado:** 12 estágios com `position` 1–12; `isWon = true` só em Arrematação; possíveis linhas extra em `stages` com `position` ~1M+.
