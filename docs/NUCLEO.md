# FlowOS v4 — Núcleo Imutável

As 7 camadas invariantes que existem em **qualquer instância** do FlowOS, independente de setor ou país.

---

## Camada 1 — Primitivos de Domínio

**Pacote:** `@flow-os/core/domain`

Os tipos fundamentais que modelam qualquer negócio:

```
Workspace    → tenant isolado (empresa/escritório/clínica)
Deal         → qualquer negócio/oportunidade (venda, caso, consulta, obra)
Stage        → etapa do pipeline (coluna Kanban)
Contact      → pessoa física ou jurídica envolvida
Task         → ação com prazo, prioridade Eisenhower e assignee
Flow         → automação de processo (trigger → condições → ações)
FlowStep     → etapa atômica de um flow
Agent        → agente IA com identidade, skills e memória
BrainMemory  → fragmento de conhecimento contextual do agente
```

**Regra de ouro:** nenhum desses tipos tem campo de setor. Toda especificidade fica em `*.meta: Json`.

---

## Camada 2 — Motor Eisenhower

**Pacote:** `@flow-os/core/eisenhower`

Classifica e ordena tarefas pelos 4 quadrantes:

| Quadrante  | Urgente | Importante | Ação            |
|------------|---------|------------|-----------------|
| Q1 — FAZER | ✓       | ✓          | Executar agora  |
| Q2 — PLAN  | ✗       | ✓          | Agendar         |
| Q3 — DELEGAR| ✓      | ✗          | Delegar         |
| Q4 — ELIMINAR| ✗     | ✗          | Eliminar        |

O motor recalcula quadrantes automaticamente quando prazos mudam. A IA usa o quadrante para priorizar sugestões.

---

## Camada 3 — Motor Kanban

**Pacote:** `@flow-os/core/kanban`

Pipeline visual baseado em `Stage` + `Deal`:

- Stages são configuráveis por workspace (não hardcoded)
- Transitions têm guards (condições para avançar)
- SLA por stage com alerta automático
- WIP limits configuráveis por coluna
- Velocity calculada em tempo real (deals/semana)

---

## Camada 4 — Motor de Fluxos

**Pacote:** `@flow-os/core/flow-engine`

Executa automações de negócio armazenadas como dados:

```
Trigger    → o que inicia o flow (evento, cron, webhook, manual)
Condition  → guarda booleano (ex: deal.value > 50000)
Action     → o que acontece (email, task, agent, webhook, stage change)
```

Flows são versionados. Rollback instantâneo. Execução auditada linha a linha.

---

## Camada 5 — AgentRuntime

**Pacote:** `@flow-os/core/agent-runtime`

Executa agentes de IA com:

- **Skills** declarativas (o que o agente sabe fazer)
- **Memory** persistente entre sessões
- **Tool-calling** seguro (lista de ferramentas permitidas por agente)
- **Audit log** imutável de cada ação
- **Budget limit** por agente/mês (custo controlado)
- **Human-in-the-loop** configurável (aprovação antes de agir)

---

## Camada 6 — Brain IA

**Pacote:** `@flow-os/brain`

Pipeline de inteligência com cascata de custo decrescente:

```
Mês 1-2:   GPT-4o-mini      → $15/1M tokens  (gateway universal)
Mês 3-4:   Padrões extraídos → memória vira template
Mês 5-6:   Fine-tune         → modelo especializado no negócio
Mês 7-12+: Modelo local       → custo ~$0/token
```

**Resultado:** -98% de custo operacional de IA em 12 meses.

---

## Camada 7 — Portal

**Pacote:** `apps/web` (Next.js 14 App Router)

Interface unificada com:

- Dashboard por workspace
- Kanban visual (deals por stage)
- Inbox de tarefas com filtro Eisenhower
- Timeline de flows executados
- Chat com agentes
- Analytics de velocidade e SLA
- Admin de templates e configurações
