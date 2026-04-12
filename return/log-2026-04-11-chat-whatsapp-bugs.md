# Chat WhatsApp — Bug Fixes (2026-04-11)

> Sessao Claude Code — resolucao dos 10 bugs abertos do modulo Chat WA.
> Typecheck OK: `pnpm --filter @flow-os/web typecheck` passou sem erros.

---

## BUG-01 — Webhook 401 persistente [CRITICO — BLOQUEANTE]

**Status:** Log diagnostico adicionado, aguardando deploy + verificacao.

**Arquivo:** `apps/web/src/app/api/webhooks/evolution/route.ts`

**O que foi feito:**
- Extraiu cada header em variavel separada (`headerApikey`, `headerXToken`, `headerBearer`)
- Adicionou `console.log("[webhook-auth]", { ...ultimos 4 chars })` antes da verificacao
- Log mostra os 3 headers possiveis vs os 2 env vars + resultado `isAuthorized`

**Proximo passo:**
1. Deploy no Railway
2. Mandar mensagem WA para a instancia `arrematador_01`
3. Railway logs → copiar output do `[webhook-auth]`
4. Ajustar token na Evolution ou no Railway conforme divergencia
5. Remover log apos confirmar

---

## BUG-08 — Remetente nao identificado [CRITICO]

**Status:** Corrigido.

**Arquivos:**
- `apps/web/src/app/(portal)/chat/_lib/chat-queries.ts` — linha 490
- `apps/web/src/app/(portal)/chat/_components/ChatClient.tsx` — componente Bubble

**Causa raiz:**
1. `getMessages()` lia `inp["name"]` mas o webhook de grupo grava `inp["senderName"]`
2. Componente `Bubble` nunca exibia `msg.author`

**Correcao:**
1. Adicionado `inp["senderName"]` ao chain de fallback: `senderName ?? name ?? actorId ?? "Cliente"`
2. Adicionado bloco de nome do remetente acima da mensagem em bolhas recebidas (estilo accent, 11px, truncate)

---

## BUG-02 — Chat nao atualiza em tempo real [CRITICO]

**Status:** Corrigido.

**Arquivo:** `apps/web/src/app/(portal)/chat/_components/ChatClient.tsx` — handler SSE

**Causa raiz:**
- Webhook de mensagens diretas emite `DEAL_UPDATE` (nao `NEW_MESSAGE`)
- O handler SSE do `DEAL_UPDATE` so incrementava o unreadCount — nao refetchava o historico
- Resultado: chat aberto nao atualizava sem reload

**Correcao:**
- Adicionado re-fetch de historico no handler `DEAL_UPDATE` quando `d.taskId === activeIdRef.current`

---

## BUG-03 — Historico nao carrega [CRITICO]

**Status:** Dependencia direta do BUG-01.

**Analise:**
- `getMessages()` busca no `AgentAuditLog` primeiro
- Se vazio, chama `fetchEvolutionMessagesFallback()` que faz POST para `/chat/findMessages/{instance}`
- O fallback esta correto e completo (validado pela leitura do codigo)
- Com webhook 401, nenhuma mensagem e gravada no audit log
- Apos BUG-01 resolvido, historico deve funcionar automaticamente

---

## BUG-04 — Audio nao reproduz [IMPORTANTE]

**Status:** Corrigido.

**Arquivo:** `apps/web/src/app/api/webhooks/evolution/route.ts`

**Causa raiz:**
- `convertToMp4` estava como `mediaMeta.kind === "VIDEO"` (so video)
- Audio WhatsApp vem como `audio/ogg; codecs=opus` — incompativel com alguns browsers
- Evolution API converte para MP4 quando `convertToMp4: true`

**Correcao:**
- `convertToMp4 = mediaMeta.kind === "VIDEO" || mediaMeta.kind === "AUDIO"`

---

## BUG-05 — Imagem nao renderiza [IMPORTANTE]

**Status:** Corrigido.

**Arquivo:** `apps/web/src/app/api/webhooks/evolution/route.ts`

**Causa raiz:**
- Evolution v2 com `webhookBase64=true` envia o base64 em `data.base64`
- O codigo passava `message: payload.data.message` para `extractInlineEvolutionMediaBuffer`
- `extractInlineEvolutionMediaBuffer` procurava `message["base64"]` — campo inexistente
- Resultado: base64 inline ignorado, fallback para API falhava silenciosamente

**Correcao:**
1. Adicionado campo `base64?: string` ao tipo `EvolutionWebhookPayload.data`
2. Normaliza `payload.data.base64` para `messageRecord["base64"]` antes do processamento

---

## BUG-06 — PDF enviado corrompido [IMPORTANTE]

**Status:** Parcialmente corrigido (codigo). Pendente verificacao infra MinIO.

**Arquivos:**
- `packages/brain/src/providers/evolution-api.ts` — `sendMedia()`
- `apps/web/src/app/api/chat/send/route.ts` — schema Zod
- `apps/web/src/app/(portal)/chat/_components/ChatClient.tsx` — payload de envio

**Causa raiz (codigo):**
- Provider hardcodava mimetype (`application/pdf` para tudo, `image/png` para imagens)
- O mimetype real do arquivo nunca fluia do frontend ate a Evolution API

**Correcao:**
1. Provider `sendMedia` agora aceita parametro `mimeType?: string` (usa real se disponivel, fallback para mapa)
2. Schema Zod do `/api/chat/send` aceita `mimeType` opcional
3. Frontend salva `file.type` e envia como `mimeType` no payload

**Pendencia infra:**
- Verificar se bucket `flowos-media` esta publico no MinIO console
- URL: `https://minio-production-e7ac.up.railway.app`

---

## BUG-07 — Nome do grupo mostra ultimo remetente [IMPORTANTE]

**Status:** Corrigido.

**Arquivo:** `apps/web/src/app/api/webhooks/evolution/route.ts` — update de grupo

**Causa raiz:**
- `mergeGroupTaskDescription` no update gravava `groupName: groupSubject || senderName`
- Se `groupSubject` nao vinha no payload (nem do fallback), `groupName` era sobrescrito com o nome do ultimo remetente a cada mensagem
- `getConversations()` lia `descMeta["groupName"]` para exibir

**Correcao:**
- No update (grupo ja existente), so sobrescreve `groupName` quando `groupSubject` existe de fato
- Usa spread condicional: `...(groupSubject ? { groupName: groupSubject } : {})`

---

## BUG-09 — Contador de nao lidas diverge [BAIXO]

**Status:** Corrigido.

**Arquivos:**
- **Novo:** `apps/web/src/app/api/chat/[taskId]/read/route.ts`
- `apps/web/src/app/(portal)/chat/_components/ChatClient.tsx`

**Causa raiz:**
- Ao clicar numa conversa, `unreadCount` era zerado so no state local
- Nao existia endpoint para persistir a leitura no banco
- Ao recarregar a pagina, o count antigo voltava do `ChatSession.unreadCount`

**Correcao:**
1. Criado `POST /api/chat/[taskId]/read` que faz `chatSession.updateMany({ unreadCount: 0 })`
2. Ao clicar na conversa, alem de zerar no state, faz `fetch()` para persistir no banco

---

## BUG-10 — React error #418 hydration mismatch [BAIXO]

**Status:** Corrigido.

**Arquivo:** `apps/web/src/app/(portal)/chat/_components/ChatSidebar.tsx`

**Causa raiz:**
- 4 elementos com `toLocaleString`/`toLocaleDateString` sem `suppressHydrationWarning`
- Node.js e browser podem formatar datas de forma diferente (locales, timezone)

**Correcao:**
- Adicionado `suppressHydrationWarning` nas linhas 277, 358, 479, 687

---

## Arquivos modificados

```
apps/web/src/app/api/webhooks/evolution/route.ts        — BUG-01, 04, 05, 07
apps/web/src/app/(portal)/chat/_lib/chat-queries.ts     — BUG-08
apps/web/src/app/(portal)/chat/_components/ChatClient.tsx — BUG-02, 06, 08, 09
apps/web/src/app/(portal)/chat/_components/ChatSidebar.tsx — BUG-10
apps/web/src/app/api/chat/send/route.ts                 — BUG-06
packages/brain/src/providers/evolution-api.ts            — BUG-06
apps/web/src/app/api/chat/[taskId]/read/route.ts        — BUG-09 (novo)
```

## Checklist pos-deploy

- [ ] Verificar logs `[webhook-auth]` no Railway apos mandar msg WA
- [ ] Ajustar token se headers nao batem
- [ ] Remover log diagnostico apos BUG-01 confirmado
- [ ] Verificar bucket `flowos-media` publico no MinIO console
- [ ] Testar envio de PDF apos bucket publico
- [ ] Testar audio recebido (deve tocar inline)
- [ ] Testar imagem recebida (deve renderizar inline)
- [ ] Verificar nome do grupo nao muda com mensagens novas
- [ ] Verificar nome do remetente aparece nas bolhas
- [ ] Verificar chat atualiza em tempo real sem reload
- [ ] Verificar contador nao lidas zera ao abrir conversa e persiste apos reload

---

## Auditoria de Governanca

**SEC-03 verificado:** Endpoint `POST /api/chat/[taskId]/read` usa `where: { taskId, workspaceId }` com workspaceId da sessao (nunca do request). Aprovado.

**Bugs aprovados sem ressalvas:** BUG-02, 07, 08, 09, 10 — implementacoes limpas, sem violacao de politicas.

**Atencao antes do deploy:** BUG-06 depende de infra MinIO (bucket publico).

---

## Raciocinio Executado — Resumo por Bug

### BUG-01 — Estrategia de diagnostico
- Leitura completa do handler POST (linhas 576-950)
- Identificou 3 headers aceitos (`apikey`, `x-webhook-token`, `Authorization Bearer`) e 2 env vars (`EVOLUTION_WEBHOOK_TOKEN`, `EVOLUTION_API_KEY`)
- Decisao: log seguro (ultimos 4 chars, conforme SEC policy) antes da verificacao — nao apos, para capturar inclusive o caso de 401
- Nao tentou "adivinhar" o token correto — precisa do log em producao para confirmar

### BUG-08 — Analise de divergencia campo/query
- Rastreou o fluxo completo: webhook grava `input.senderName` (grupo) e `input.name` (direto) no `AgentAuditLog`
- `getMessages()` lia apenas `inp["name"]` — grupos sempre caiam para "Cliente"
- Verificou que `msg.author` existia no tipo `ChatMessage` mas nunca era renderizado no `Bubble`
- Correcao em 2 pontos: query (fallback chain) + UI (exibicao do nome)

### BUG-02 — Analise de fluxo SSE
- Mapeou os 2 caminhos de publicacao SSE:
  - Grupo: `publishKanbanEvent({ type: "NEW_MESSAGE" })` → cliente refetch historico ✓
  - Direto: `publishKanbanEvent({ type: "DEAL_UPDATE" })` → cliente so incrementava badge ✗
- Verificou que `DEAL_UPDATE` ja incluia `taskId` no payload (linha 909 do webhook)
- Usou `activeIdRef.current === d.taskId` (ref ja existente) em vez de criar novo ref

### BUG-03 — Analise de dependencia
- Leitura completa de `getMessages()` e `fetchEvolutionMessagesFallback()` (~130 linhas)
- Validou: query ao audit log filtra por `output.taskId` (inbound) e `input.taskId` (outbound) — correto
- Fallback para Evolution API `POST /chat/findMessages/{instance}` — correto, com extrator robusto que testa 6 formatos de resposta
- Consultou Context7 para parametros da API — `page`/`offset` nao documentados mas inofensivos
- Conclusao: bug e consequencia direta do webhook 401, nao ha bug de codigo

### BUG-04 — Analise de codec
- Identificou que `convertToMp4` so cobria `VIDEO` (linha 123)
- Audio WhatsApp = `audio/ogg; codecs=opus` — codec nao suportado universalmente em `<audio>` HTML
- Evolution API aceita `convertToMp4: true` para audio — converte OGG para MP4/AAC
- Fix minimo: adicionar `|| mediaMeta.kind === "AUDIO"` na condicional

### BUG-05 — Analise de payload Evolution v2
- Verificou a interface `EvolutionWebhookPayload` — campo `base64` ausente no tipo
- Rastreou o fluxo: `messageRecord = payload.data.message` → passado para `extractInlineEvolutionMediaBuffer`
- `extractInlineEvolutionMediaBuffer` busca `message["base64"]` — mas Evolution v2 envia em `data.base64` (nivel acima)
- Fix: normalizar `payload.data.base64` para `messageRecord["base64"]` antes do processamento de midia

### BUG-06 — Analise de pipeline de envio
- Rastreou: ChatClient `onMediaFileChange` → `POST /api/media/upload` → MinIO → URL retornada
- Depois: `POST /api/chat/send` → `evolutionApi.sendMedia()` → Evolution API `POST /message/sendMedia/{instance}`
- Identificou: `mimeMap` hardcodado no provider (`application/pdf` para tudo, `image/png` para imagens)
- O `file.type` real do browser nunca chegava ao Evolution — perdido no caminho
- Fix: propagou `mimeType` real do frontend ate o provider (3 arquivos: ChatClient, send/route, evolution-api.ts)
- Notou pendencia de infra: bucket MinIO precisa ser publico para Evolution baixar o arquivo

### BUG-07 — Analise de sobrescrita de nome
- Rastreou `mergeGroupTaskDescription` — merge simples `{ ...base, ...patch }`
- No update, patch incluia `groupName: groupSubject || senderName`
- Se `groupSubject` vazio → `groupName` = `senderName` (ultimo remetente) a cada msg
- Fix: spread condicional — so sobrescreve `groupName` quando `groupSubject` confirmado

### BUG-09 — Analise de persistencia
- Grep por `unreadCount` no ChatClient: zerado no state local ao clicar (linha 1398)
- Grep por `markAsRead|unreadCount.*0` na API: nenhum endpoint existente
- Confirmou: `getConversations()` le `ChatSession.unreadCount` do banco — nunca zerado
- Fix: endpoint novo `POST /api/chat/[taskId]/read` + chamada fire-and-forget no onClick
- Verificado SEC-03: `where: { taskId, workspaceId }` com workspaceId da sessao

### BUG-10 — Analise de hydration
- Grep por `Date.now|new Date|toLocale` em ChatClient e ChatSidebar
- ChatClient: 2 pontos ja tinham `suppressHydrationWarning` (relTime na ConvRow, timestamp no Bubble)
- ChatSidebar: 4 pontos sem protecao (linhas 277, 358, 479, 687)
- Verificou que `dayGreeting()` nao causa hydration (so chamado em callback de usuario, nao no render)
- Fix minimo: adicionou `suppressHydrationWarning` nos 4 elementos

---

## Ordem de deploy recomendada

```
1. git add dos 7 arquivos modificados + 1 novo
2. pnpm --filter @flow-os/web typecheck  (ja passou)
3. git commit -m "fix(chat): resolve 10 bugs modulo WhatsApp"
4. git push → Railway auto-deploy
5. Mandar msg WA → copiar log [webhook-auth] do Railway
6. Ajustar token conforme divergencia → novo commit se necessario
7. Remover console.log diagnostico → commit final
8. MinIO console → bucket flowos-media → set PUBLIC
9. Validar checklist completo acima
```
