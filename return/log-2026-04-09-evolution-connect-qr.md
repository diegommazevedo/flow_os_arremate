# Log — Conexão Evolution `arrematador_01` (Opção B curl)

**Data:** 2026-04-09

## GET `/instance/connect/arrematador_01`

- **Sem** `?number=`: HTTP 200, corpo `{"count":0}` (sem campo `base64` / QR no formato que o FlowOS espera).
- **Com** `?number=5527999857599`: idem `{"count":0}`.

**Interpretação:** nesta versão/host o `connect` por curl **não** devolveu imagem QR utilizável pelo snippet da documentação interna (`pickQrForClient`). Preferir **Opção A — Portal** (`POST /api/integrations/evolution/status` com sessão) ou script `apps/web/scripts/evolution-qr-live.ts` alinhado à mesma lógica de retries/restart.

## GET `/instance/connectionState/arrematador_01`

Após os `connect` acima:

```json
{"instance":{"instanceName":"arrematador_01","state":"connecting"}}
```

**Nota:** `connectionState` pode mostrar `connecting` enquanto `fetchInstances` ainda lista `connectionStatus: close` — fontes diferentes na API; usar ambas como referência.

## Próximos passos (operador)

1. Escanear QR via **portal** (recomendado) até `state` / critério interno `open` ou `connected`.
2. Validar de novo `connectionState` e `fetchInstances`.
3. `POST /webhook/set/arrematador_01` com URL do `flowos-web` production (ver mensagem de sprint).
4. Smoke Kanban.

**Secrets:** não colar `token` Evolution nem `AUTHENTICATION_API_KEY` nestes ficheiros.
