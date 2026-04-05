# FlowOS v4 — O Linux dos Negócios

> **Núcleo imutável. Templates infinitos.**

---

## Conceito

FlowOS é um sistema operacional para negócios. Como o Linux tem um kernel que qualquer distribuição pode usar sem modificar, o FlowOS tem um **núcleo imutável** (`@flow-os/core`) que qualquer template de setor pode usar.

Trocar de imobiliária para clínica? Zero migrations. O campo `Deal.meta: Json` absorve toda especificidade de setor.

---

## Estrutura do Monorepo

```
flow_os/
├── packages/
│   ├── core/          @flow-os/core     Núcleo imutável (7 camadas)
│   ├── db/            @flow-os/db       Schema Prisma universal
│   ├── brain/         @flow-os/brain    AgentRuntime + Brain IA
│   └── templates/     @flow-os/templates Template Engine + 5 setores
├── apps/
│   └── web/           @flow-os/web      Portal Next.js 15
├── docs/
│   ├── MANIFESTO.md   7 princípios invioláveis
│   ├── NUCLEO.md      7 camadas invariantes
│   ├── FORTALEZA.md   12 invariantes de segurança [SEC-01..12]
│   ├── BRAIN_IA.md    Fluxo Brain IA + cascata de custo -98%
│   └── TEMPLATES.md   5 templates prontos
└── .cursor/rules/
    └── flowos.mdc     Cursor Rules — instruções para o IDE
```

---

## Stack

| Camada         | Tecnologia                              |
|----------------|-----------------------------------------|
| Portal         | Next.js 15 (App Router) + TypeScript    |
| Database       | PostgreSQL via Supabase (RLS)           |
| ORM            | Prisma 5 com pgvector                   |
| Auth           | Supabase Auth                           |
| IA Gateway     | OpenAI (GPT-4o-mini → fine-tune → local)|
| Validation     | Zod                                     |
| Styling        | Tailwind CSS                            |
| Package Manager| pnpm workspaces                         |

---

## Quick Start

```bash
# 1. Instalar dependências
pnpm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# editar .env com suas credenciais

# 3. Setup do banco
pnpm db:push
pnpm db:seed

# 4. Iniciar em desenvolvimento
pnpm dev
```

---

## As 7 Camadas do Núcleo

1. **Primitivos de Domínio** — tipos TypeScript de `Workspace`, `Deal`, `Stage`, `Task`, `Flow`, `Agent`
2. **Motor Eisenhower** — Q1/Q2/Q3/Q4 automático por urgência × importância × prazo
3. **Motor Kanban** — stages configuráveis, WIP limits, SLA, velocity
4. **Motor de Fluxos** — automações como dados: trigger → condição → ação
5. **AgentRuntime** — IA com skills declarativas, memória persistente, budget limit
6. **Brain IA** — cascata GPT-4o-mini → fine-tuned → local (-98% custo em 12 meses)
7. **Portal** — Next.js com Dashboard, Kanban, Eisenhower, Flows, Brain

---

## 5 Templates Prontos

| Template       | ID              | Pipeline                                          |
|----------------|-----------------|---------------------------------------------------|
| Imobiliária    | `real-estate`   | Captação → Simulação Caixa → Aprovação → Chaves   |
| Clínica        | `clinic`        | Lead → Agendamento → Consulta → Alta → Retorno    |
| Advocacia      | `law-firm`      | Consulta → Contrato → Em andamento → Encerrado    |
| Construtora    | `construction`  | Prospecção → Obra em andamento → Entrega          |
| Hotelaria      | `hospitality`   | Consulta → Reserva → Check-in → Check-out         |

---

## Segurança — 12 Invariantes

`[SEC-01]` Isolamento de tenant · `[SEC-02]` Auth em todo endpoint  
`[SEC-03]` Autorização por role · `[SEC-04]` Secrets nunca no cliente  
`[SEC-05]` Validação Zod · `[SEC-06]` Audit log imutável  
`[SEC-07]` Budget limit de IA · `[SEC-08]` Sanitização de prompt  
`[SEC-09]` HTTPS obrigatório · `[SEC-10]` Rate limiting  
`[SEC-11]` PII fora dos logs · `[SEC-12]` Rotação de secrets 90d

---

## Brain IA — Projeção de Custo

| Período  | Modelo         | Custo/mês | Economia  |
|----------|----------------|-----------|-----------|
| Mês 1-2  | gpt-4o-mini    | ~$225     | —         |
| Mês 5-6  | fine-tuned     | ~$120     | -47%      |
| Mês 7+   | local (Ollama) | ~$15      | **-98%**  |

---

## Leitura Recomendada

1. [`docs/MANIFESTO.md`](docs/MANIFESTO.md) — comece aqui
2. [`docs/NUCLEO.md`](docs/NUCLEO.md) — as 7 camadas
3. [`docs/FORTALEZA.md`](docs/FORTALEZA.md) — os 12 invariantes de segurança
4. [`docs/BRAIN_IA.md`](docs/BRAIN_IA.md) — fluxo completo + cascata de custo
5. [`docs/TEMPLATES.md`](docs/TEMPLATES.md) — os 5 templates de setor
6. [`.cursor/rules/flowos.mdc`](.cursor/rules/flowos.mdc) — instruções para o Cursor
