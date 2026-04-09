# Log — Evolution Railway (`evolution-api-production-d423`)

## Data

2026-04-02 — DNS do host público resolvido; testes `curl` a partir do ambiente de desenvolvimento.

## Base URL

`https://evolution-api-production-d423.up.railway.app`

## Variáveis Railway (operador)

- **flowos-web:** `EVOLUTION_API_URL` = URL acima; `EVOLUTION_API_KEY` = mesma **`AUTHENTICATION_API_KEY`** do serviço Evolution.
- **flowos-evolution:** self-reference da API URL em geral **não** é necessária para a app (só `flowos-web` + integrações DB).

## Curls executados

**Chave usada na tentativa:** valor de desenvolvimento (`.env.local` ou placeholder) — **não** a chave de produção.

### 1. `GET /instance/fetchInstances`

**HTTP:** 401

**Body:**

```json
{"status":401,"error":"Unauthorized","response":{"message":"Unauthorized"}}
```

### 2. `GET /webhook/find/arrematador_01`

**HTTP:** 401

**Body:**

```json
{"status":401,"error":"Unauthorized","response":{"message":"Unauthorized"}}
```

## Conclusão

- Serviço **atingível**; **`apikey` incorreta** para produção.
- Repetir os dois curls com `$env:EVOLUTION_API_KEY` = secret copiado do **Railway → serviço Evolution → AUTHENTICATION_API_KEY** (ou o valor que guardaram como API key global da Evolution).
- Depois de alinhar `flowos-web`, colar aqui o JSON **200** (redigir apenas se houver outros segredos no payload).
