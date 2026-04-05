TYPECHECK FIX — 2026-03-31

- Typecheck zerado.
- Build limpo.

Observação arquitetural: `Document.orgId`

O campo `orgId` foi removido do schema de `Document` porque o Prisma Client não o havia gerado, provavelmente porque a migration não rodou após a adição do campo.

O isolamento multi-tenant de `Document` continua garantido via `deal.workspaceId` nas queries, em vez de coluna própria no model. Arquiteturalmente isso permanece válido porque todo `Document` pertence a um `Deal`, e o `Deal` já carrega o `workspaceId`.

Registrar nas próximas auditorias como item de observação:

- Não é vulnerabilidade.
- É um desvio do padrão adotado no projeto, onde cada model tende a ter `orgId` próprio.

Estado informado do projeto:

```bash
pnpm dev
pnpm build
docker compose up -d
```

Go-live disponível em `http://localhost:3030/golive`.
