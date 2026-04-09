# Log — WhatsApp / Evolution (produção — diagnóstico)

**Fonte:** devolutiva Cursor (tentativa de curl + alinhamento com código).

## Endpoints Evolution (referência código)

- Lista de instâncias: `GET {apiUrl}/instance/fetchInstances` — header `apikey`.
- Webhook **configurado pela app FlowOS:** `POST {apiUrl}/webhook/set/{instance}` → URL típica `{appUrl}/api/webhooks/evolution`.
- Auditoria manual: `GET …/webhook/find/{instance}` (se API suportar na vossa versão).

Estados usados no código incluem variantes **`open`** / **`connected** para sessão utilizável.

## Comandos sugeridos (PowerShell)

Usar **`curl.exe`** (não o alias `curl` do PowerShell):

```powershell
$key = $env:EVOLUTION_API_KEY
curl.exe -sS "https://evolution.flowos.com.br/instance/fetchInstances" -H "apikey: $key"
curl.exe -sS "https://evolution.flowos.com.br/webhook/find/arrematador_01" -H "apikey: $key"
```

## Limite da execução remota (Cursor/agents)

Tentativa de `curl.exe` para `evolution.flowos.com.br` a partir do ambiente do agente resultou em **`Could not resolve host`** — não foi possível obter JSON real da produção. Colar aqui (ou em novo `return/log-*.md`) os outputs quando corrido na rede/credenciais corretas.

### Execução 2026-04-02 (rede local do developer)

- **`nslookup evolution.flowos.com.br`** (resolver residencial): **`Non-existent domain`** — o hostname **não existe** na DNS pública vista daqui (não é só “sandbox”).
- **`curl`**: `Could not resolve host` (HTTP 000).
- **Conclusão:** antes de QR/webhook, confirmar **FQDN real** da Evolution (Railway/custom domain), registo **A/CNAME** no DNS e propagação. Enquanto o domínio não resolver, nem curl nem FlowOS conseguem falar com esse host.

## FlowOS-native — auth real

`GET /api/integrations/evolution/status` usa **`getSessionContext()`** → **cookies Supabase** na sessão do browser, **não** `Authorization: Bearer` genérico. Para Postman: replicar cookie de sessão ou usar o portal já logado.

O **POST** do mesmo route (QR/diagnóstico pesado com `fetchInstances`) é que devolve corpo 502 com `diagnostics` quando algo falha — o **GET** só chama `connectionState` por integração e devolve `{ integrations: [{ id, name, instanceName, status }] }`.

## Checklist mental pós-output

- `fetchInstances`: entrada **`arrematador_01`** (nome exato) e `state` / `connectionStatus`.
- `webhook/find`: URL aponta para FlowOS; alinhar com `EVOLUTION_WEBHOOK_TOKEN` / validação no `POST /api/webhooks/evolution`.
- Alternativa: `GET /api/integrations/evolution/status` autenticado no portal (diagnóstico já pensado no código).
