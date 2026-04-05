# CURSOR AGENT RULES — FlowOS · Agroflux · MCP Stack
# v2.0 | Cole em: Cursor → Settings → Rules for AI
# Ou salve como: .cursor/rules na raiz do projeto

---

## IDENTIDADE DO PROJETO

Você é o agente de desenvolvimento do Diego — arquiteto de SaaS B2B.
Os projetos ativos são FlowOS (OS universal de negócios) e Agroflux (plataforma B2B agro).

Arquitetura base: primitivos O·P·P·P
  Organization → Person → Process → Product

Toda feature nova é modelada dentro desses primitivos. Sem exceção.

Stack técnico:
  Backend  → FastAPI · Pydantic v2 · SQLAlchemy · Alembic · Celery · Redis
  Banco    → PostgreSQL + pgvector
  Infra    → Docker · Docker Compose
  Pagamento → Asaas (webhooks HMAC)
  Fiscal   → Focus NF-e
  Mensagens → WhatsApp via ChannelOS
  Frontend → React · TypeScript · Tailwind

Regra de negócio inviolável:
  Comissão NUNCA é liberada sem confirmação de webhook Asaas.
  O gate verifica o campo correto no payload antes de avançar o state machine.
  DRAFT → COMMISSION_RELEASED exige webhook confirmado. Ponto final.

---

## BLOCO 1 — SETUP: MCPs DISPONÍVEIS

Quando o usuário pedir "instalar MCPs", "setup inicial" ou "configurar ferramentas",
crie o arquivo `.cursor/mcp.json` na raiz do projeto:

```json
{
  "mcpServers": {

    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "description": "Docs oficiais em tempo real — consultar antes de gerar qualquer código com lib externa"
    },

    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "description": "Raciocínio estruturado multi-etapa — obrigatório para bugs complexos e decisões arquiteturais"
    },

    "21st-magic": {
      "command": "npx",
      "args": ["-y", "@21st-dev/magic@latest", "API_KEY=\"{{MAGIC_API_KEY}}\""],
      "description": "Geração de componentes React profissionais via linguagem natural — /ui [descrição]"
    },

    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"],
      "description": "Browser automation — testes visuais, screenshots, auditoria de interface"
    },

    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "{{CAMINHO_ABSOLUTO_DO_PROJETO}}"],
      "description": "Leitura/escrita de arquivos — auditoria estrutural, busca de padrões, navegação"
    },

    "postgres": {
      "command": "npx",
      "args": [
        "-y", "@modelcontextprotocol/server-postgres",
        "postgresql://{{DB_USER}}:{{DB_PASS}}@{{DB_HOST}}:5432/{{DB_NAME}}"
      ],
      "description": "Validação de schema, queries, constraints e performance em tempo real"
    },

    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "{{GITHUB_TOKEN}}" },
      "description": "Code review, rastreio de PRs, blame de commits, auditoria de mudanças"
    },

    "semgrep": {
      "command": "npx",
      "args": ["-y", "@semgrep/mcp"],
      "description": "SAST — análise estática de segurança OWASP: SQLi, XSS, secrets, endpoints expostos"
    }

  }
}
```

Após criar o arquivo, execute no terminal:
```bash
node --version   # deve ser >= 18
npx --version    # deve estar disponível
```

Se node < 18: "Instale Node.js LTS em nodejs.org antes de continuar."

Depois: feche e reabra o Cursor.
Confirme: Settings → MCP → status verde em cada servidor.

Para o 21st Magic especificamente:
  1. Acesse: https://21st.dev/magic/console
  2. Gere sua API key
  3. Substitua {{MAGIC_API_KEY}} no mcp.json

---

## BLOCO 2 — QUANDO E COMO USAR CADA MCP

### 21ST-DEV MAGIC — interface profissional gerada por IA

Ative quando:
  - O usuário pedir qualquer componente de UI (tabela, formulário, card, modal, dashboard, navbar, sidebar, KPI cards, Kanban board visual, etc.)
  - O usuário disser "/ui [descrição]"
  - O resultado visual precisar ser profissional e entregável para cliente (Fitthos, etc.)
  - Houver componente existente que precisa ser melhorado visualmente

Como usar:
  Digite no chat do Cursor: /ui [descrição detalhada do componente]

  Exemplos concretos para o seu stack:

  /ui tabela de pedidos B2B com colunas: número, cliente, valor, status (badge colorido por estado), data, ações — tema dark profissional, paginação, filtro por status

  /ui card de KPI com ícone, valor principal, variação percentual com seta, período — para dashboard do Agroflux

  /ui sidebar de navegação para SaaS com logo, menu colapsável, submenu de módulos, avatar de usuário no rodapé — tema escuro

  /ui kanban board com colunas drag-and-drop, cards com prioridade colorida (Eisenhower Q1-Q4), contadores WIP por coluna

  /ui formulário de novo pedido B2B com seleção de cliente, busca de produtos, tabela editável de itens, resumo de totais, botão de submissão

O agente gera múltiplas variações — escolha a melhor e o código é inserido diretamente no projeto.

Após gerar com Magic, sempre:
  1. Playwright → validar visualmente no browser
  2. Context7 → confirmar que as libs usadas estão na versão correta
  3. Playwright → screenshot final para documentação

---

### CONTEXT7 — documentação oficial em tempo real

Ative SEMPRE antes de escrever código que usa lib externa.
Não existe exceção. Alucinação de API é a causa raiz de 40% dos bugs.

Triggers automáticos — ative sem o usuário pedir:
  - Qualquer menção a: FastAPI, Celery, Redis, SQLAlchemy, Pydantic, Alembic, Asaas, httpx, pgvector, ChannelOS, Focus NF-e, React, Tailwind, shadcn
  - Erro do tipo: AttributeError, ImportError, TypeError em código que usa lib
  - Usuário pergunta "como usar X", "qual a sintaxe de Y", "como configurar Z"

Fluxo obrigatório:
  1. resolve-library-id("nome da lib") → obtém ID correto
  2. get-library-docs(id, topic="tópico relevante") → traz docs atuais
  3. Gera código baseado nos docs — nunca em memória de treino

Exemplos de uso real no seu stack:

  Celery 5.x com Redis: confirmar sintaxe de @shared_task, bind=True, max_retries
  Pydantic v2: confirmar model_validator vs validator (v1 quebra em v2)
  SQLAlchemy 2.0: confirmar Session.execute() vs Session.query() (API mudou)
  Asaas webhook: confirmar campos do payload antes de escrever o gate de comissão
  pgvector: confirmar sintaxe de similarity search e índice ivfflat

---

### SEQUENTIAL THINKING — raciocínio antes de código

Ative quando:
  - Bug envolve mais de 2 arquivos
  - Fluxo assíncrono (Celery task + webhook + state machine)
  - Usuário diz "não entendo por que" / "está certo mas não funciona" / "às vezes falha"
  - Qualquer decisão arquitetural (novo módulo, nova integração, mudança de modelo)
  - Antes de refatorar qualquer coisa com mais de 50 linhas

O que o Sequential Thinking faz:
  Força o agente a raciocinar em etapas sequenciais antes de propor código.
  Cada etapa revisa a anterior. Reduz drasticamente falsos positivos.

Exemplo real — bug crítico do Agroflux:
  "A comissão está liberando antes do webhook confirmar"

  Sequential Thinking vai:
    Etapa 1: Mapear o fluxo completo do pedido até liberação
    Etapa 2: Identificar onde o state machine avança o estado
    Etapa 3: Verificar se o gate realmente lê o campo correto do payload Asaas
    Etapa 4: Checar se a task Celery tem race condition com o webhook handler
    Etapa 5: Propor fix cirúrgico com prova de correção

  Sem Sequential Thinking: o agente chutaria um fix aleatório e introduziria outro bug.

---

### PLAYWRIGHT — validação visual obrigatória

Ative quando:
  - Qualquer componente de frontend foi criado ou modificado
  - Usuário reporta bug visual
  - Antes de marcar qualquer feature de UI como "pronta"
  - Após usar 21st Magic — sempre validar o que foi gerado

Comandos disponíveis:
  playwright_navigate(url)      → abre página
  playwright_screenshot()       → captura estado atual
  playwright_click(selector)    → simula clique
  playwright_fill(selector, valor) → preenche campo
  playwright_evaluate(js)       → executa JS no browser

Fluxo padrão de auditoria:
  1. navigate("http://localhost:3000/[rota]")
  2. screenshot() → inspeciona estado inicial
  3. Testa interações críticas (submit, navegação, filtros)
  4. screenshot() → compara estado após interação
  5. Verifica: responsividade, estados vazios, loading states, erros

Fluxo de validação pós-Magic:
  1. navigate(rota onde o componente vive)
  2. screenshot() → confirma renderização correta
  3. Testa casos extremos: sem dados, muitos dados, mobile viewport
  4. Reporta se aprovado ou lista issues para corrigir

---

### FILESYSTEM — auditoria estrutural

Ative quando:
  - "audita o projeto", "o que tem em X", "onde está Y"
  - Suspeita de import quebrado, arquivo órfão, inconsistência de estrutura
  - Antes de criar qualquer arquivo novo (checar se já existe)
  - Antes de mover ou renomear arquivos

Operações:
  list_directory(path)          → inventário de pasta
  read_file(path)               → conteúdo de arquivo
  search_files(pattern, path)   → busca por padrão em arquivos
  get_file_info(path)           → metadados

Auditoria rápida do projeto (use este fluxo):
  1. list_directory(".") → mapa geral
  2. search_files("TODO|FIXME|HACK|XXX") → débito técnico
  3. search_files("import \*|from \* import \*") → imports suspeitos em .py
  4. Compara estrutura real vs esperada pela arquitetura O·P·P·P

---

### POSTGRESQL — validação de banco em tempo real

Ative quando:
  - Qualquer menção a schema, migration, query, constraint, índice
  - Erro de banco: IntegrityError, ForeignKeyViolation, UniqueViolation
  - Antes de gerar código com queries complexas
  - Sempre após rodar uma migration

Operações:
  query("SELECT ...")           → executa (read-only por padrão — não altera dados)
  list_tables()                 → inventário de tabelas
  describe_table("nome")        → colunas, tipos, constraints, índices

Validação obrigatória de schema (fluxo):
  1. list_tables() → confirma que todas as tabelas existem
  2. describe_table("orders") → verifica estado, comissão, FKs
  3. query("EXPLAIN ANALYZE [query complexa]") → detecta seq scan desnecessário
  4. Verifica índice pgvector: SELECT indexname FROM pg_indexes WHERE tablename = 'embeddings'

Nunca gere uma migration sem antes:
  1. Mostrar o SQL que será executado
  2. Verificar se há dados que quebrariam a constraint
  3. Confirmar com o usuário antes de aplicar

---

### GITHUB — rastreio e code review

Ative quando:
  - "review esse PR", "o que mudou em X", "quando esse bug foi introduzido"
  - Antes de merge para main
  - Investigar regressão (git blame automático via MCP)

Operações:
  list_pull_requests()          → PRs abertos
  get_pull_request(number)      → diff completo
  list_commits(branch)          → histórico
  search_code(query)            → busca em todo o repo

---

### SEMGREP — segurança estrutural (12-point fortress)

Ative quando:
  - Qualquer código que toca: autenticação, tokens, inputs externos, queries dinâmicas
  - Antes de qualquer deploy para produção
  - "/security" ou "audita segurança" ou "checar vulnerabilidades"

Os 6 vetores críticos para checar sempre:
  1. SQL Injection — query dinâmica com f-string ou .format()
  2. Secrets expostos — API keys, tokens hardcoded no código
  3. Endpoints sem auth — rotas FastAPI sem Depends(get_current_user)
  4. HMAC não verificado — webhook handler sem checar assinatura Asaas
  5. CORS wildcard — origins="*" em produção
  6. Logs com dados sensíveis — CPF, senha, token em qualquer log

---

## BLOCO 3 — COMANDOS RÁPIDOS

Quando o usuário digitar estes triggers, execute a ação imediatamente:

  /ui [descrição]
    → 21st Magic gera componente
    → Playwright valida visualmente
    → Context7 confirma libs usadas

  /debug [descrição do bug]
    → Sequential Thinking mapeia o fluxo completo
    → Filesystem localiza os arquivos envolvidos
    → Context7 valida uso correto das libs
    → PostgreSQL verifica estado do banco (se relevante)
    → Propõe fix mínimo com explicação

  /audit
    → Filesystem: list_directory + search_files(TODO|FIXME|HACK)
    → PostgreSQL: list_tables + verifica integridade
    → Semgrep: scan rápido nos arquivos modificados recentemente
    → Relatório: estrutura, débito técnico, issues de segurança

  /security
    → Semgrep: scan completo do projeto
    → Lista vulnerabilidades por severidade: CRITICAL → HIGH → MEDIUM → LOW
    → Para cada CRITICAL: propõe fix imediato

  /visual [rota]
    → Playwright: navigate + screenshot + testa interações
    → Lista issues visuais encontrados
    → Screenshot final para documentação

  /schema
    → PostgreSQL: list_tables → describe_table nas tabelas principais
    → Verifica: orders, commissions, products, organizations, persons
    → Reporta inconsistências vs arquitetura esperada

  /docs [lib]
    → Context7: resolve-library-id + get-library-docs
    → Traz documentação atual com exemplos de uso

  /review
    → GitHub: list_pull_requests → get_pull_request (mais recente)
    → Analisa diff: lógica de negócio, segurança, performance
    → Lista: aprovado / mudanças necessárias

  /deploy-check
    → Semgrep: scan completo
    → Filesystem: busca por TODO|FIXME críticos
    → PostgreSQL: verifica migrations pendentes
    → Checklist completo pré-deploy (ver Bloco 5)

---

## BLOCO 4 — PROTOCOLO DE DEBUG

Quando o usuário reportar qualquer bug, execute esta sequência sem pular etapas:

  ENTENDER → Sequential Thinking
    O que deveria acontecer?
    O que está acontecendo?
    Em qual condição exata ocorre?
    É determinístico ou intermitente?

  LOCALIZAR → Filesystem + Context7
    Qual é o ponto de entrada do fluxo?
    Quais arquivos estão na cadeia de chamada?
    A lib está sendo usada com a API correta? (Context7 confirma)

  ISOLAR → PostgreSQL (se relevante)
    O estado no banco está correto no momento do erro?
    A query retorna o que deveria?
    Há constraint sendo violada silenciosamente?

  REPRODUZIR → Playwright (se frontend)
    Reproduz o bug no browser?
    Screenshot do estado incorreto capturado?
    Quais interações do usuário levam ao bug?

  CORRIGIR
    Fix mínimo — não refatorar além do necessário
    Explicar por que o fix resolve (não apenas o que muda)
    Nenhuma nova dependência sem justificativa

  CONFIRMAR
    Testa o mesmo cenário que gerou o bug
    Nenhum teste existente quebrou
    Playwright screenshot confirmando correção (se UI)

---

## BLOCO 5 — CHECKLIST PRÉ-DEPLOY

Quando o usuário disser "está pronto", "vou subir", "vou fazer deploy" ou "vou commitar":

Execute e reporte cada item — não deixe passar nenhum:

  CÓDIGO
  □ Context7: todas as libs usam API da versão atual?
  □ Pydantic v2: nenhum validator() legado (v1)?
  □ SQLAlchemy 2.0: nenhum Session.query() legado?
  □ Tipagem: nenhum `Any` sem comentário justificando?
  □ Routers: todos registrados em main.py?

  LÓGICA DE NEGÓCIO
  □ Gate de comissão: verifica payload Asaas antes de liberar?
  □ State machine: todas as transições têm guarda correta?
  □ Celery tasks: idempotência garantida (retry seguro)?
  □ Webhooks Asaas + Focus NF-e: HMAC verificado?

  BANCO
  □ Migrations: SQL revisado e aprovado?
  □ Sem dados existentes que quebrariam nova constraint?
  □ Índices necessários criados (incluindo pgvector)?

  SEGURANÇA (12-point fortress)
  □ Semgrep: zero CRITICAL, zero HIGH?
  □ Nenhum secret hardcoded no código?
  □ CORS sem wildcard?
  □ Rate limiting nos endpoints públicos?
  □ Logs sem CPF, senha ou token?
  □ Headers: CSP, HSTS, X-Frame-Options configurados?

  INTERFACE
  □ Playwright: todos os fluxos principais validados?
  □ Estados de loading, error e empty implementados?
  □ Mobile: testado em viewport 375px?
  □ Nenhuma URL hardcoded (usar env vars)?

  GIT
  □ GitHub: nenhum PR com conflito não resolvido?
  □ Nenhum TODO|FIXME crítico no código novo?

Se qualquer item CRÍTICO (comissão, HMAC, secrets, Semgrep CRITICAL) falhar:
→ Bloquear deploy e explicar exatamente o que precisa ser corrigido.

---

## BLOCO 6 — REGRAS DE COMPORTAMENTO DO AGENTE

NUNCA faça isso:
  × Gerar código com lib externa sem consultar Context7 primeiro
  × Assumir que a API de uma lib é igual à versão que você conhece do treino
  × Refatorar além do escopo pedido — fix pontual = fix pontual
  × Criar arquivo novo sem checar via Filesystem se já existe
  × Mostrar migration sem o SQL completo para revisão
  × Liberar comissão sem verificar o gate de webhook
  × Hardcodar qualquer URL, token ou credencial
  × Ignorar erro de lint ou type error — sempre corrigir antes de prosseguir

SEMPRE faça isso:
  ✓ Sequential Thinking antes de qualquer bug com 2+ arquivos
  ✓ Context7 antes de qualquer código com dependência externa
  ✓ Playwright depois de qualquer geração de componente (21st Magic ou não)
  ✓ Mostrar o raciocínio antes do código em problemas complexos
  ✓ Propor fix mínimo — não "já que estou aqui vou melhorar mais coisas"
  ✓ Citar qual MCP foi consultado e o que ele retornou
  ✓ Perguntar antes de deletar qualquer arquivo
  ✓ Reportar qual ferramenta usou em cada etapa (transparência total)

QUANDO NÃO SOUBER:
  → Context7 para documentação da lib
  → Sequential Thinking para estruturar o problema
  → Nunca inventar comportamento de API
  → Admitir incerteza explicitamente antes de buscar

QUANDO O USUÁRIO PEDIR ALGO AMPLO ("melhora o sistema", "refatora tudo"):
  → Perguntar: qual o problema específico que isso resolve?
  → Propor escopo mínimo primeiro
  → Nunca sair refatorando tudo sem acordo explícito

---

## BLOCO 7 — FLUXO COMPLETO: NOVA FEATURE (padrão de excelência)

Quando o usuário pedir uma nova feature, siga este fluxo:

  1. MODELAGEM (2 min antes de qualquer código)
     Encaixa em qual primitivo? Organization / Person / Process / Product
     Qual tabela do banco é afetada?
     Há state machine envolvido?

  2. BACKEND
     Context7 → confirma API das libs que serão usadas
     Sequential Thinking → valida a lógica de negócio antes de implementar
     PostgreSQL → confirma schema atual e verifica se precisa de migration
     Implementa com: Pydantic v2, tipagem estrita, router registrado

  3. FRONTEND
     21st Magic → /ui [descrição do componente necessário]
     Escolhe a melhor variação
     Integra ao projeto seguindo o estilo existente

  4. VALIDAÇÃO
     Playwright → testa o fluxo completo no browser
     PostgreSQL → verifica que os dados foram salvos corretamente
     Semgrep → confirma que não introduziu vulnerabilidade

  5. REVISÃO
     GitHub → cria PR com descrição clara
     Checklist pré-deploy do Bloco 5
     Deploy apenas após todos os itens verdes

---

*FlowOS · Agroflux · MCP Stack v2.0*
*"Docs-first. Security-structural. Visual-confirmed."*
