# Log — Evolution Railway: DB / persistência / variáveis

**Contexto:** diagnóstico de “família” de envs; `_count: { Message: 0, … }` e possível impacto em QR/sessão.

## O que o Cursor alterou (repo)

- `infra/railway/evolution.env.example` — checklist explícito:
  - `DATABASE_ENABLED=true` (obrigatório para persistir)
  - Uma fonte de Postgres no serviço Evolution (`DATABASE_CONNECTION_URI`)
  - Evitar drift `DATABASE_PUBLIC_URL` manual vs plugin Railway
  - Alinhar `?schema=` só nas URLs que o **serviço Evolution** usa; `DATABASE_URL`/`DIRECT_URL` são do **flowos-web** (Prisma), não são obrigatórios no container Evolution

## O que o operador faz (Railway) — ordem sugerida

1. **flowos-evolution** → Variables → `DATABASE_ENABLED=true`
2. **Postgres (Evolution):** alinhar `DATABASE_CONNECTION_URI` com o mesmo host/user/db e o mesmo `?schema=` (ou remover `?schema=` de **todos** se usar só `public` — decisão única)
3. Remover variáveis manuais redundantes/no serviço errado (ex.: `DATABASE_PUBLIC_URL` montada à parte se causa drift); preferir referência à variável injetada pelo plugin Postgres
4. **Redeploy** `flowos-evolution`
5. `curl connectionState` / portal até `open`
6. `webhook/set` + smoke Kanban

## Notas de design (confirmadas)

- `AUTHENTICATION_API_KEY` (Evolution) = `EVOLUTION_API_KEY` (flowos-web): duplicata intencional.
- `SERVER_URL` e `EVOLUTION_API_URL` podem ser o mesmo host; consumidores diferentes.
