# Log — Processo de equipa (governança + codificação)

**Fonte:** pedido do utilizador (2026-04-02).

## Modelo de trabalho (acordado em conversa)

- **Cursor (agente codificador):** implementação, refactors pontuais, execução de comandos no repo, correção de SQL/schema, scripts (`seed:arremate`), diagnóstico técnico quando o ambiente permite.
- **Claude Code (assistente governante no teu fluxo):** síntese, continuidade de sprint, decisões de produto/roadmap, orquestração do ping‑pong, leitura desta pasta `return/`.
- **Tu:** decisão final, credenciais, produção, validação humana.

## Pasta `return/`

Serve como **buffer de verdade** entre ferramentas: logs de devolutivas, outputs de smoke, SQL corrigido, limites de ambiente (ex.: DNS/credenciais), próximos blocos (produção seed, Evolution, Kanban fictício).

## Próximos blocos (estado ao fecho deste lote)

1. Replicar seed em **produção** (UUID Bruno + `DATABASE_URL` Railway).
2. **WhatsApp produção** — instância `arrematador_01`: estado + webhook (outputs a colar nos logs).
3. **Smoke Kanban** — deal fictício ponta a ponta.
