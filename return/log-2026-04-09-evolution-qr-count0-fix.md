# Log — QR Evolution só `{"count":0}` (chaves: count)

## Sintoma (UI)

Mensagem: *QR Code não disponível após várias tentativas. Resposta Evolution (chaves): **count**. Build FlowOS: connect-v2.1.2-retries.*

- API URL Railway já correta; instância `arrematador_01` existe.
- `GET /instance/connect/...` devolve **200** com corpo só `{"count":0}` — sem `base64` / `code` / `pairingCode`.

## Causa (referência)

Comportamento conhecido em builds Evolution (reconnect antes de gerar QR). Documentação oficial prevê `pairingCode`, `code`, `count` no mesmo objeto; em estado preso aparece só `count`.

## Alteração no código (FlowOS)

**Ficheiros:** `apps/web/src/app/api/integrations/evolution/status/route.ts`, `apps/web/src/lib/evolution.ts`

1. Antes do primeiro ciclo de `connect`: **`DELETE /instance/logout/{instance}`** (OpenAPI v2) + pausa ~2,5s — limpa sessão Baileys pendente.
2. Se o primeiro bloco falhar, **novo `logout`** + pausa ~2s **antes** do `POST /instance/restart/{instance}`.
3. Marca de deploy: **`EVOLUTION_QR_FLOW` = `connect-v2.1.3-logout-preflight`** (confirmar no header/json após deploy).

## Operador

1. Deploy **`flowos-web`** com este commit.
2. No portal: **Conectar via QR Code** outra vez.
3. Se ainda falhar: no Railway **flowos-web**, definir **`EVOLUTION_CONNECT_NUMBER=5527999857599`** (só dígitos, número do WhatsApp da instância) — algumas builds só respondem com `?number=` no `connect`.
4. Longo prazo: alinhar imagem Evolution no Railway a uma versão com correções de loop de QR (upstream EvolutionAPI).
