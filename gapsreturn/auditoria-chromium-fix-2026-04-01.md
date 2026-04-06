AUDITORIA FlowOS — Fix chromium-bidi — 01/04/2026

CRÍTICO:
- BUILD QUEBRADO: `pnpm build` falha em `packages/brain/src/providers/evolution-api.ts` por import inválido `../evolution/instance-state.js` (arquivo existente é `instance-state.ts`). Erro: "Module not found: Can't resolve '../evolution/instance-state.js'" (trace: `apps/web/src/app/api/chat/send/route.ts`).
- Testes do `@flow-os/brain` não estão verdes (8 falhas no suite atual), incluindo 1 falha em `rpa-caixa.test.ts`.

ALERTA:
- `apps/web/next.config.ts` tem `chromium-bidi` em `serverExternalPackages` (ok), mas o build ainda tentou resolver código do `@flow-os/brain` (subpath export `@flow-os/brain/providers/evolution-api`) durante o bundle do Next; hoje isso expõe imports com extensão `.js` dentro do TS source.

DEBT:
- `packages/brain/src/agents/relatorio-imovel-types.ts` e `packages/brain/src/workers/rpa-caixa-types.ts` contêm apenas tipos (ok), mas não carregam o marcador solicitado `[P-01] DEBT-ARQUITETURAL` no próprio arquivo de tipos (o debt está em `relatorio-imovel.ts`).
- `@flow-os/brain` expõe TS source direto via `exports` (ex.: `./providers/evolution-api` -> `./src/providers/evolution-api.ts`). Isso aumenta a superfície de problemas de resolução de extensão (`.js` vs `.ts`) em bundlers.

TESTES FALHANDO:
- `packages/brain/src/workers/__tests__/rpa-caixa.test.ts`:
  - FAIL: "C1: IMOV-001-SP novo → criado como Q2_PLAN (prazo > 48h)".
  - Causa: teste depende de `Date.now()` real; no fixture `IMOV-001-SP` tem `Limite recebimento boleto=05/04/2026` e o código classifica `hoursToDeadline < 48` como `Q1_DO`. Rodando em 05/04/2026, o prazo está <=48h (ou vencido), então vira `Q1_DO`.
  - Fix mínimo proposto: tornar o teste determinístico com `vi.useFakeTimers()` + `vi.setSystemTime(new Date("2026-03-30T12:00:00Z"))` (e `vi.useRealTimers()` no teardown) para alinhar com os comentários do teste (C1 >48h, C3 ~24h).
- `packages/brain/src/providers/__tests__/whatsapp-meta.test.ts`:
  - FAIL: cenários 1,2,3,4,5,7 (Webhook WhatsApp). Erro: falha ao importar `apps/web/src/app/api/webhooks/whatsapp/route` (sem extensão) via Vite/Vitest.
  - Causa provável: import sem `.ts` não resolve fora do pacote (`.../route` vs `.../route.ts`). O arquivo existe em `apps/web/src/app/api/webhooks/whatsapp/route.ts`.
  - Fix mínimo proposto: trocar os imports do teste para `.../route.ts` (ou ajustar config de resolução do Vitest/Vite para aceitar essa forma para paths fora do pacote).
- `packages/brain/src/agents/__tests__/relatorio-imovel.test.ts`:
  - FAIL: expectativa do mock `deps.vectorSearch.upsert` desatualizada.
  - Causa: implementação chama `upsert("past_interactions", indexContent, metaObj, workspaceId)` (ordem/assinatura diferente do esperado pelo teste).
  - Fix mínimo proposto: atualizar o teste para validar a nova assinatura (ex.: `toHaveBeenCalledWith("past_interactions", expect.any(String), expect.objectContaining({ id: "report:deal-001" }), "ws-001")`).

TYPECHECK: LIMPO (`pnpm --filter @flow-os/web typecheck`)
BUILD: FALHOU (`pnpm build`)
VEREDICTO: REPROVADO
