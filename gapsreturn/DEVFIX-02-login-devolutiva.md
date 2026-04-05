# DEVFIX-02 — Página de Login

**Data:** 31/03/2026
**Status:** RESOLVIDO
**Impacto:** GET /login 404 bloqueava dashboard, kanban e chat

---

## Problema

Todas as páginas protegidas (`/dashboard`, `/kanban`, `/chat`) redirecionavam para `/login`
quando a sessão estava ausente, mas a rota `/login` nunca havia sido criada — resultando
em 404 imediato e loop de redirecionamento.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `apps/web/src/app/login/page.tsx` | Server Component — detecta modo dev vs produção |
| `apps/web/src/app/login/_components/LoginClient.tsx` | Client Component — formulário magic link + senha |

---

## Comportamento

### Desenvolvimento (sem Supabase configurado)

Se `DEFAULT_WORKSPACE_ID` estiver no `.env.local` e `NODE_ENV=development`:
→ `/login` redireciona automaticamente para `/dashboard` sem exibir formulário.

Se `DEFAULT_WORKSPACE_ID` não estiver definido:
→ exibe formulário desabilitado com aviso amarelo orientando a configurar a variável.

### Produção (Supabase configurado)

- **Magic link**: envia e-mail com link de acesso via `supabase.auth.signInWithOtp()`
- **Senha**: login com email + password via `supabase.auth.signInWithPassword()`

---

## Validação

```bash
# 1. Obter workspaceId (após db:push + db:seed)
docker exec -it flow_os-postgres-1 psql -U flowos -d flowos_prod \
  -c 'SELECT id FROM "workspaces" LIMIT 1;'

# 2. Adicionar ao .env.local
echo 'DEFAULT_WORKSPACE_ID="cuid_obtido_acima"' >> apps/web/.env.local

# 3. Reiniciar o servidor
pnpm dev

# 4. Acessar — deve ir direto para o dashboard
open http://localhost:3030
```

---

## Gaps relacionados

- `DEVFIX-01` — favicon.ico 404 (resolvido via `metadata.icons`)
- `DEVFIX-03` — (próximo se houver)
