# Devolutiva — Campanhas · Redis privado · Standalone brain

**Projeto:** FlowOS v4 · Arrematador Caixa  
**Data:** 2026-04-14  
**Tema:** auditoria fluxo campanha → WA; checklist Railway Private Network; empacotamento Next standalone + `@flow-os/brain`.

---

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  DEVOLUTIVA — FlowOS · 2026-04-14                                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  CAMPANHAS → DISPARO                                                         ║
║  • Fluxo: POST /api/campaigns → BullMQ `campaign-dispatch` → worker        ║
║    `campaign-dispatcher.ts` → Evolution `POST …/message/sendText/{instance}`.║
║  • WA_MESSAGE: destino = phone do Contact (lead). DOSSIER: WA aos motoboys ║
║    (`field-agent-dispatcher`) — por desenho, não é bug de “lista mista”.    ║
║  • Modal “Nova campanha”: page.tsx — sem catch no fetch; sucesso fecha      ║
║    modal; erro HTTP mantém aberto (esperado).                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  REDIS (Railway)                                                             ║
║  • Hostname privado = nome do **serviço** + `.railway.internal` (ex.:       ║
║    serviço `redis` → `redis.railway.internal` — não usar hostname inventado).║
║  • Private Networking ON nos dois; após mudar REDIS_URL → redeploy manual.  ║
║  • Fallback diagnóstico: URL pública temporária.                             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  STANDALONE + BRAIN                                                          ║
║  • Dockerfile: cp packages/brain → standalone/node_modules/@flow-os/brain; ║
║    Playwright desde .pnpm; NODE_OPTIONS=--import tsx; tsx em apps/web deps.  ║
║  • next.config: outputFileTracingRoot + outputFileTracingIncludes brain.     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  PRÓXIMOS PASSOS                                                             ║
║  • Railway: validar Redis + rede privada; ENABLE_WORKERS + fila consumida.   ║
║  • UI: opcional try/catch em createCampaign (campanhas/page.tsx).           ║
║  • Longo prazo: compilar brain para dist (tsc dedicado), tirar tsx runtime. ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 1. Grafo campanha → Evolution (código)


| Etapa                     | Ficheiro / rota                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| UI criação                | `apps/web/src/app/(portal)/campanhas/page.tsx` (`createCampaign` → `POST /api/campaigns`)                        |
| Ações lista/detalhe       | `apps/web/src/app/(portal)/campanhas/_components/CampaignActions.tsx`, `…/[id]/_components/CampaignMonitor.tsx`  |
| API criar                 | `apps/web/src/app/api/campaigns/route.ts`                                                                        |
| Enfileirar / item / todos | `campaign-dispatcher.ts` export `enqueueCampaignDispatchJobs`; rotas `…/items/…/dispatch`, `…/dispatch-all`      |
| Worker                    | `packages/brain/src/workers/campaign-dispatcher.ts`                                                              |
| Evolution                 | `packages/brain/src/providers/evolution-api.ts` — header `apikey`, env `EVOLUTION_API_KEY` + `EVOLUTION_API_URL` |
| DOSSIER / motoboys        | `packages/brain/src/workers/field-agent-dispatcher.ts`                                                           |


**Prisma:** `Campaign` sem JSON `recipients`; destinos em `CampaignItem.contactId` + `contact.phone` (WA_MESSAGE).

---

## 2. Sintomas vs causa provável


| Sintoma                     | Causa provável no código / ops                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Modal não fecha             | `!r.ok` ou exceção no `fetch` sem `catch` (loading volta no `finally`)                                          |
| Campanha criada, WA não sai | Redis/worker inativo; tipo DOSSIER vs WA_MESSAGE mal alinhado à expectativa                                     |
| “Motoboy como destinatário” | DOSSIER contacta motoboys por desenho; WA_MESSAGE usa sempre `Contact` do item — rever dados se for lead errado |


---

## 3. Redis Private Network (checklist Railway)

1. **Mesmo ambiente** — `web` e Redis no mesmo project/env (ex. `production`).
2. **Private Networking** — ON em **ambos** os serviços (Settings → Networking).
3. **Hostname privado** — o DNS interno segue o **nome do serviço** no Railway, não o “nome bonito” do projeto. Exemplo validado: serviço chamado `redis` → host `**redis.railway.internal`** (porta típica **6379**). Um valor como `flowos-redis.railway.internal` **só funciona** se o serviço se chamar mesmo `flowos-redis`; caso contrário dá `ENOTFOUND` e a fila BullMQ não arranca.
4. `**REDIS_URL` no serviço web** — usar a password/user do plugin Redis que o Railway mostra nas Variables do serviço Redis; formato ilustrativo:
  `redis://default:<PASSWORD>@redis.railway.internal:6379`
5. **Após alterar variável** — fazer **redeploy manual** do serviço web (o Railway não garante restart automático só por gravar env).
6. **Prova rápida** — URL pública temporária no `REDIS_URL` confirma se Redis e app estão saudáveis à parte do DNS interno.

**Logs a procurar após redeploy (com `ENABLE_WORKERS=true`):** `✓ CampaignDispatchWorker`, `Brain Worker pronto` (ou equivalente no `worker-entrypoint`).

---

## 4. Standalone + brain (alterações já descritas na sessão)

- **Dockerfile:** após `pnpm build`, copiar `packages/brain` para `…/standalone/node_modules/@flow-os/brain`; Playwright a partir de `node_modules/.pnpm/...`; `ENV NODE_OPTIONS="--import tsx"`.  
- **apps/web/package.json:** `tsx` em `dependencies`.  
- **apps/web/next.config.ts:** `outputFileTracingRoot` + `outputFileTracingIncludes` para `packages/brain`.

*Lockfile: correr `pnpm install` após mudança de deps.*

---

## 5. Invariantes (referência)

- **SEC-02:** não logar API keys; Evolution usa `EVOLUTION_API_KEY`.  
- **SEC-03:** `workspaceId` da sessão nas rotas API e queries do worker.  
- **P-02:** sem mudança de schema nesta devolutiva.

---

## Ficheiros desta devolutiva


| Local                                     | Caminho                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Repositório                               | `return/devolutiva-2026-04-14-campanhas-redis-standalone.md`        |
| Handoff (fora do git, copiar manualmente) | `C:\dev\return\devolutiva-2026-04-14-campanhas-redis-standalone.md` |


---

## Encerramento da sessão (2026-04-14)

### Resumo fechado


| #   | Item                                                     | Status                                                                                                      |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Build webpack Playwright                                 | OK                                                                                                          |
| 2   | Standalone `email-sync` / brain                          | OK                                                                                                          |
| 3   | Session null (Neemias + fzenith)                         | OK                                                                                                          |
| 4   | Rotas 502 → 503 `QUEUE_UNAVAILABLE`                      | OK (`tryEnqueueCampaignDispatchJobs` + rotas campanha)                                                      |
| 5   | Modal não fecha (finally / fluxo de erro)                | OK (documentado / padrão `finally` em `busy`; validar UX em `campanhas/page.tsx` se ainda houver edge case) |
| 6   | Redis hostname `flowos-redis` → `redis.railway.internal` | Identificado — **aguarda** `REDIS_URL` no serviço web + redeploy manual                                     |


### Único pendente operacional

1. Serviço **web** (Railway) → Variables → `REDIS_URL=redis://default:<PASSWORD>@redis.railway.internal:6379` (password do plugin Redis).
2. **Redeploy manual** do web.
3. Logs: `✓ CampaignDispatchWorker` / `Brain Worker pronto` → BullMQ vivo → campanhas desbloqueadas (BUG-03).

### Git / handoff

- **HEAD no momento do arquivamento:** `7930f76d7f915a053aa03185a741711db0a47b76` (`fix(web): build Next sem bundlar Playwright…`).  
- Várias alterações desta sessão (Dockerfile, `campaign-queue-enqueue`, rotas 503, `.env.example`, etc.) podem estar **ainda por commit** — após integrar e fazer push, **atualizar esta secção** com o hash do commit que fechar o pacote.

### Handoff fora do repo

1. Copiar este ficheiro para `C:\dev\return\devolutiva-2026-04-14-campanhas-redis-standalone.md`.
2. Anexar **print** dos logs Railway com o worker confirmado.
3. Substituir o hash acima pelo do commit final da sessão, quando existir.

---

*Complementar com print do deploy e evidência do worker após `REDIS_URL` correto.*