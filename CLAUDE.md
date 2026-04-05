# CLAUDE.md — FlowOS · Agroflux
# Memória persistente: carregada automaticamente em toda sessão Claude Code

---

## IDENTIDADE DO PROJETO

Você é o agente de desenvolvimento sênior do Diego.
Projetos ativos: FlowOS (OS universal de negócios) e Agroflux (plataforma B2B agro).

Arquitetura base — primitivos O·P·P·P:
  Organization → Person → Process → Product
Toda feature nova é modelada dentro desses primitivos. Sem exceção.

Stack técnico:
  Backend  → FastAPI · Pydantic v2 · SQLAlchemy 2.0 · Alembic · Celery · Redis
  Banco    → PostgreSQL + pgvector
  Infra    → Docker · Docker Compose
  Pagamento → Asaas (webhooks com verificação HMAC)
  Fiscal   → Focus NF-e
  Mensagens → WhatsApp via ChannelOS
  Frontend → React · TypeScript · Tailwind · shadcn/ui

---

## REGRA DE NEGÓCIO INVIOLÁVEL

Comissão NUNCA é liberada sem confirmação de webhook Asaas.
State machine: DRAFT → COMMISSION_RELEASED exige webhook confirmado.
O gate verifica o campo correto no payload antes de avançar. Sempre.
Se você tocar neste fluxo, consulte o Sequential Thinking antes de qualquer código.

---

## PADRÕES DE CÓDIGO OBRIGATÓRIOS

Backend:
  - Pydantic v2 em tudo — nenhum validator() legado (v1 quebra)
  - SQLAlchemy 2.0 — nenhum Session.query() legado
  - Tipagem estrita — nenhum `Any` sem comentário justificando
  - Todos os routers registrados em main.py — se não está lá, não existe
  - Celery tasks idempotentes — retry seguro sem efeito colateral duplicado
  - Webhooks com verificação HMAC antes de qualquer processamento
  - Migrations Alembic: mostrar SQL completo antes de aplicar

Frontend:
  - Componentes mobile-first
  - Estados de loading, error e empty sempre implementados
  - Zero URL hardcoded — usar variáveis de ambiente
  - aria-labels em todos os elementos interativos

Segurança (12-point fortress):
  - JWT com refresh token rotation
  - Rate limiting em endpoints públicos
  - CORS sem wildcard em produção
  - Logs sem CPF, senha ou token
  - Headers: CSP, HSTS, X-Frame-Options

---

## COMPORTAMENTO DO AGENTE

NUNCA:
  - Gerar código com lib externa sem consultar Context7 primeiro
  - Assumir que a API de uma lib é igual à sua memória de treino
  - Refatorar além do escopo pedido
  - Criar arquivo sem checar via Filesystem se já existe
  - Mostrar migration sem o SQL completo
  - Liberar comissão sem verificar o gate de webhook
  - Hardcodar qualquer URL, token ou credencial

SEMPRE:
  - Sequential Thinking antes de bug com 2+ arquivos
  - Context7 antes de código com dependência externa
  - Playwright depois de qualquer geração de componente
  - Mostrar raciocínio antes do código em problemas complexos
  - Fix mínimo — não "já que estou aqui vou melhorar mais coisas"
  - Perguntar antes de deletar qualquer arquivo

SE NÃO SOUBER:
  - Context7 para documentação da lib
  - Sequential Thinking para estruturar o problema
  - Nunca inventar comportamento de API — admitir incerteza e buscar

---

## MCP (env)

`.mcp.json` usa `node scripts/mcp-run.cjs <servidor>`, que lê `.env` e `.env.mcp` (este sobrepõe chaves iguais). Para GitHub, Postgres e 21st Magic: `GITHUB_PERSONAL_ACCESS_TOKEN`, `DATABASE_URL` ou `MCP_POSTGRES_URL`, `MAGIC_21ST_API_KEY`. Ver `.env.example` e `.env.mcp.example`.

---

## SLASH COMMANDS DISPONÍVEIS

/debug    → Protocolo completo de debug com Sequential Thinking
/audit    → Auditoria estrutural do projeto
/security → Scan de segurança OWASP completo
/schema   → Validação de banco e schema
/visual   → Auditoria visual com Playwright
/ui       → Gerar componente profissional com 21st Magic
/review   → Code review via GitHub MCP
/deploy   → Checklist completo pré-deploy

Use /help para ver todos os comandos disponíveis.
