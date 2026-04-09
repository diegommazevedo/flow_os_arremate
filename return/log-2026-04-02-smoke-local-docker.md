# Log — Smoke test local (Docker Postgres)

**Fonte:** execução Cursor na máquina do developer.

## Contexto

- Container: `flow_os-postgres-1`, DB `flowos_prod`, utilizador `flowos`.
- **Não havia** workspace `%arremate%` / `%bruno%` na base local; usado **`ws_flowos_main`** (`slug` flowos) só para smoke.

## Comando seed (exemplo)

```powershell
cd packages\db
$env:DATABASE_URL="postgresql://flowos:flowos_dev@127.0.0.1:5433/flowos_prod"
$env:WORKSPACE_ID="ws_flowos_main"
pnpm seed:arremate
```

**Output consola (resumo):**

```
Arremate seed → workspace flowos (ws_flowos_main)
OK: 12 estágios (posições 1–12), 5 departamentos, 5 tags.
```

## Validação SQL (copiado)

### `stages` (18 linhas: 12 pipeline + 6 antigos em 1M+)

```
         name          | position | slaDays | isWon 
-----------------------+----------+---------+-------
 Triagem               |        1 |       7 | f
 Sem Acesso            |        2 |       7 | f
 1º Contato            |        3 |       7 | f
 Contratação           |        4 |       7 | f
 ITBI                  |        5 |      15 | f
 Registro de Imóvel    |        6 |      15 | f
 Troca de Titularidade |        7 |      15 | f
 Envio Docs            |        8 |      15 | f
 Docs Enviados         |        9 |      15 | f
 Emissão de NF         |       10 |      15 | f
 Processo Concluído    |       11 |      15 | f
 Arrematação           |       12 |      15 | t
 Ganho                 |  1000000 |         | t
 Lead                  |  1000001 |         | f
 Negociação            |  1000002 |         | f
 Perdido               |  1000003 |         | f
 Proposta              |  1000004 |         | f
 Qualificado           |  1000005 |         | f
```

### `departments` (5)

```
 Condomínio / Gestão
 Contrato
 ITBI
 Operações
 Registro
```

### `chat_tags` (5)

```
 Cliente não responde | #6b7280  | 0
 Inadimplente         | #dc2626  | 1
 ITBI pendente        | #f59e0b  | 2
 Docs ok              | #22c55e  | 3
 Urgente              | #e11d48  | 4
```

## Conclusão operacional

Smoke **validado**: pipeline 1–12, SLA, `isWon` exclusivo em Arrematação, deptos/tags OK; estágios antigos em 1M+ são esperados e não bloqueiam `orderBy position asc` para o primeiro estágio.
