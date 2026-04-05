AUDITORIA FlowOS — ChatGuru Parte 1 — 31/03/2026

CRÍTICO:
- [P-01] Violação em `packages/db/prisma/seed.ts` com termos proibidos do setor, incluindo `ITBI`, `escritura`, `registro`, `caixa`, `boleto`, `imovel`, `licitação`, `pipedrive` e `matricula`.
- [P-01] Violação em `packages/db/scripts/migrate-pipedrive.ts` com termos proibidos do setor, incluindo `Pipedrive`, `ITBI`, `registro`, `boleto`, `corretor`, `imovel`, `matricula`, `licitação` e `caixa`.
- [P-01] Violação em `apps/web/src/app/api/webhooks/whatsapp/route.ts` com termos proibidos do setor nas regras de roteamento por departamento `CAIXA - ...`.
- [P-01] Violação em `packages/db/prisma/schema.prisma` no comentário de `AgentConfig.agentName` com `RPA_CAIXA`.

ALERTA:
- [SEC-03] Há mutações que dependem de lookup escopado anterior, mas a query final roda por `id` puro: `apps/web/src/app/api/chat/[taskId]/info/route.ts` (`contact.update`), `apps/web/src/app/api/respostas-rapidas/[id]/route.ts` (`delete`), `apps/web/src/app/api/tags/[id]/route.ts` (`update` e `delete`). Não há `findUnique` sem `workspaceId`, mas o padrão invariável “toda query com workspaceId” não foi mantido na mutação final.
- [SCHEMA] Os novos models não atendem integralmente ao checklist de índices por workspace. `ChatSession` não tem `@@index([workspaceId])` simples e `ChatNote` tem apenas `@@index([workspaceId, taskId])`, sem índice simples por `workspaceId`.
- [WEBHOOK MULTI-APARELHO] `phoneNumberId` é extraído corretamente, a `WorkspaceIntegration` é buscada pelo `phoneNumberId`, `404` é retornado quando não há integração e `aparelhoOrigem` é gravado no `ChatSession`. O tenant é resolvido a partir da integração encontrada; não há filtro prévio por `workspaceId` nessa busca porque o `workspaceId` nasce dessa própria resolução.

DEBT:
- [P-02] Nenhuma coluna nova específica de setor foi adicionada ao Prisma. As adições novas são genéricas de chat (`status`, `departamentoId`, `aparelhoOrigem`, etc.).
- [SEC-06] Nenhuma ocorrência de `agentAuditLog.update()` ou `agentAuditLog.delete()` foi encontrada nos 14 arquivos auditados; apenas `create()`.
- [SEC-08] Confirmado nas rotas críticas pedidas: `apps/web/src/app/api/chat/[taskId]/notas/route.ts` sanitiza `conteudo` com `defaultSanitizer` antes de persistir, e `apps/web/src/app/api/respostas-rapidas/route.ts` sanitiza `atalho` e `texto` antes de persistir.

CONSISTÊNCIA: 14/14 arquivos existem
TYPECHECK: LIMPO
PRISMA: VÁLIDO
VEREDICTO: REPROVADO
