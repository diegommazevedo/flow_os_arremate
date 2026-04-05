# FlowOS — Performance UX: Loading States & Skeleton Screens

## Contexto

O Claude Code já aplicou os fixes de backend:
- `(portal)/layout.tsx` refatorado com `unstable_cache` (30s) + `<Suspense>` → página renderiza **imediatamente**, badges carregam em background
- 3 índices PostgreSQL adicionados: `deals_meta_gin_idx` (GIN), `deals_eisenhower_q1_idx` (partial), `internal_messages_workspace_created_idx`

O que resta é UX: as **páginas internas** ainda fazem Server Component fetch bloqueante antes de renderizar.
Cursor deve adicionar loading states para dar feedback imediato ao usuário.

---

## TAREFA 1 — loading.tsx em todas as rotas do portal

Criar `loading.tsx` em cada rota do `(portal)/` que ainda não tem:

```
apps/web/src/app/(portal)/kanban/loading.tsx
apps/web/src/app/(portal)/eisenhower/loading.tsx
apps/web/src/app/(portal)/chat/loading.tsx
apps/web/src/app/(portal)/interno/loading.tsx
apps/web/src/app/(portal)/atividades/loading.tsx
apps/web/src/app/(portal)/contacts/loading.tsx
apps/web/src/app/(portal)/flows/loading.tsx
apps/web/src/app/(portal)/brain/loading.tsx
apps/web/src/app/(portal)/analytics/loading.tsx
apps/web/src/app/(portal)/settings/loading.tsx
```

O `dashboard/` já tem skeleton inline — usar o mesmo padrão `animate-pulse`.

### Padrão do skeleton (usar este exato padrão para todos):

```tsx
// exemplo: kanban/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-gray-800" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-5 w-24 rounded bg-gray-800" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-20 rounded-lg bg-gray-800/60" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Adaptar o número de colunas/cards ao que faz sentido para cada rota:
- `kanban`: 4 colunas com cards empilhados
- `eisenhower`: grid 2x2 de quadrantes
- `chat`: lista vertical de conversas (esquerda) + área de mensagens (direita)
- `interno`: lista de canais (esquerda) + mensagens (direita)
- `atividades`, `contacts`: lista de linhas
- `flows`, `brain`, `analytics`, `settings`: bloco único centralizado

---

## TAREFA 2 — Transição de navegação (View Transition API)

Em `apps/web/src/app/providers.tsx`, habilitar View Transitions do Next.js:

```tsx
"use client";

import { ThemeProvider }    from "next-themes";
import { useRouter }        from "next/navigation";
import { startTransition }  from "react";
import type { ReactNode }   from "react";

// Adiciona transição suave entre páginas via View Transitions API
// (suportado em Chrome 111+, Safari 18+, Firefox 130+)

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
```

Em `apps/web/src/app/globals.css`, adicionar:

```css
/* View Transitions — fade suave entre rotas */
@view-transition {
  navigation: auto;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 150ms;
}
```

---

## TAREFA 3 — Kanban: dados via Client Component (sem SSR bloqueante)

A página `(portal)/kanban/page.tsx` provavelmente faz fetch de todos os deals no servidor antes de renderizar. Converter para:

1. `page.tsx` renderiza o shell do kanban instantaneamente (sem dados)
2. O componente de deals usa `useSWR` ou `fetch` client-side apontando para `/api/deals/list`
3. Enquanto carrega: mostra skeleton de cards
4. Quando chegam os dados: renderiza os cards normalmente

Verificar se `page.tsx` tem `export const dynamic = "force-dynamic"` — se sim, a conversão é prioridade.

---

## TAREFA 4 — Chat: SSE já existe, verificar se está sendo usado

O projeto tem `/api/sse` para Server-Sent Events. Verificar se o componente de Chat usa SSE ou polling.
Se estiver em polling: migrar para SSE usando o endpoint existente.

---

## Regras do projeto (não violar)
- [SEC-03] workspaceId da sessão em toda query
- [SEC-08] defaultSanitizer.clean() em texto externo
- [P-01] packages/brain e packages/core sem termos de setor
- Não criar novas colunas no banco — Deal.meta absorve tudo

## Verificação final
```bash
pnpm --filter @flow-os/web typecheck
```
