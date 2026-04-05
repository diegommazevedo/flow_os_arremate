# FlowOS v4 — A Fortaleza: 12 Invariantes de Segurança

Referenciáveis em code review como `[SEC-XX]`. Basta citar o código para rejeitar um PR.

---

## [SEC-01] — Isolamento de Tenant Absoluto

**Regra:** Toda query ao banco DEVE conter filtro `workspaceId`. Sem exceção.

**Razão:** Um bug de tenant leak expõe dados de todos os clientes. O RLS do Supabase garante isso no banco; o middleware de API garante na camada de aplicação.

```typescript
// ERRADO — viola SEC-01
const deals = await db.deal.findMany()

// CERTO
const deals = await db.deal.findMany({ where: { workspaceId: ctx.workspaceId } })
```

---

## [SEC-02] — Autenticação em Todo Endpoint

**Regra:** Todo endpoint de API (route handler, server action, tRPC procedure) DEVE verificar autenticação antes de qualquer lógica de negócio.

**Razão:** Endpoints não autenticados são superfície de ataque. O middleware Supabase Auth é o guardião — nunca confie em `userId` vindo do cliente.

---

## [SEC-03] — Autorização Baseada em Role

**Regra:** Ações destrutivas (delete, update de configurações críticas, export de dados) exigem verificação de `MemberRole` (`OWNER` ou `ADMIN`). Role `MEMBER` é somente leitura por padrão.

```typescript
// MemberRole enum: OWNER | ADMIN | MEMBER | VIEWER
if (member.role === 'VIEWER') throw new ForbiddenError('[SEC-03]')
```

---

## [SEC-04] — Variáveis de Ambiente Nunca no Cliente

**Regra:** Chaves secretas (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) JAMAIS são expostas ao cliente. Apenas variáveis prefixadas com `NEXT_PUBLIC_` podem ir ao browser.

**Razão:** Secrets no bundle JS são públicos — qualquer usuário pode inspecionar.

---

## [SEC-05] — Validação de Input em Todo Entry Point

**Regra:** Todo input externo (body de request, params de URL, dados de formulário) DEVE ser validado com Zod antes de chegar ao banco.

```typescript
const body = CreateDealSchema.parse(await request.json())
// Se falhar, Zod lança ZodError → retorna 400, nunca chega ao banco
```

---

## [SEC-06] — Audit Log Imutável de Ações de Agente

**Regra:** Toda ação executada por um `Agent` gera um registro em `AgentAuditLog` que é append-only (sem UPDATE, sem DELETE).

**Razão:** Rastreabilidade completa de decisões de IA. Exigência de compliance em setores regulados (saúde, jurídico, financeiro).

---

## [SEC-07] — Budget Limit de Custo de IA

**Regra:** Todo agente tem `monthlyBudgetUsd` configurado. O `AgentRuntime` bloqueia execução quando o limite é atingido.

**Razão:** Um agente em loop pode consumir milhares de dólares em minutos. O hard limit é proteção financeira e operacional.

```typescript
if (agent.usedBudgetThisMonth >= agent.monthlyBudgetUsd) {
  throw new BudgetExceededError('[SEC-07]')
}
```

---

## [SEC-08] — Sanitização de Prompt (Prompt Injection)

**Regra:** Inputs de usuário que serão incluídos em prompts de IA DEVEM ser sanitizados: truncar tamanho máximo, remover delimitadores de sistema, escapar caracteres de controle.

**Razão:** Prompt injection pode fazer o agente vazar dados de outros tenants ou executar ações não autorizadas.

---

## [SEC-09] — HTTPS Obrigatório em Produção

**Regra:** A variável `NEXT_PUBLIC_APP_URL` em produção DEVE começar com `https://`. CI/CD rejeita deploy com URL HTTP.

**Razão:** Dados de negócio sensíveis não trafegam em clear text.

---

## [SEC-10] — Rate Limiting por IP e por Usuário

**Regra:** Endpoints de autenticação e de IA têm rate limit configurado: máx. 10 tentativas de login/min por IP; máx. 100 calls de agente/hora por usuário.

**Razão:** Protege contra brute force e abuso de custo de IA.

---

## [SEC-11] — Dados PII Nunca em Logs

**Regra:** Nomes, CPFs, emails, telefones, dados de saúde e dados jurídicos JAMAIS aparecem em logs de aplicação, traces ou error tracking.

**Razão:** LGPD/GDPR. Um log com PII é incidente de segurança, não apenas um bug.

```typescript
// ERRADO — viola SEC-11
logger.info(`Processing deal for ${contact.cpf}`)

// CERTO
logger.info(`Processing deal`, { dealId: deal.id, contactId: contact.id })
```

---

## [SEC-12] — Secrets Rotacionados a Cada 90 Dias

**Regra:** `APP_SECRET`, chaves de API de IA e tokens de integração têm data de expiração configurada. O sistema alerta 7 dias antes e bloqueia após 90 dias sem rotação.

**Razão:** Secrets comprometidos têm janela de dano limitada. Rotação periódica é o menor custo de mitigação.

---

## Checklist de CI/CD

```yaml
# .github/workflows/security.yml (ou equivalente)
- Toda PR passa por scan de SEC-01 (rg "findMany\(\)" sem workspaceId)
- Toda PR passa por scan de SEC-04 (rg "OPENAI_API_KEY" em /app ou /components)
- Toda PR passa por scan de SEC-11 (rg "cpf|cnpj|senha|password" em logger calls)
- Build falha se qualquer check acima retornar match
```
