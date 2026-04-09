# Log — Evolution Railway `fetchInstances` HTTP 200

**Data:** 2026-04-09 (execução local com `AUTHENTICATION_API_KEY` no `.env` raiz).

## Request

- **Base:** `https://evolution-api-production-d423.up.railway.app`
- **GET** `/instance/fetchInstances`
- **Header:** `apikey: <AUTHENTICATION_API_KEY>` (valor em `.env`, não repetir aqui)

## Resposta

- **HTTP:** 200
- **Instâncias:** 1

### `arrematador_01` (campos úteis)

| Campo | Valor |
|--------|--------|
| id | `437aba06-6650-4d13-abad-57eb031090b2` |
| name | `arrematador_01` |
| **connectionStatus** | **`close`** |
| integration | `WHATSAPP-BAILEYS` |
| number | `5527999857599` |
| createdAt | `2026-04-09T12:15:11.686Z` |
| _count Message/Contact/Chat | 0 / 0 / 0 |

- Campo **`token`** na API: sensível — **não** versionar nem colar em chat; tratar como secret.

## Conclusão

Sessão WhatsApp **não** ativa (`close`). Próximo passo: QR / `connect` até `open` ou `connected` alinhado ao código FlowOS.

## Ver também

- `log-2026-04-02-evolution-railway-curl.md` — tentativas anteriores com 401
- `log-2026-04-02-evolution-producao.md` — DNS, auth GET status
