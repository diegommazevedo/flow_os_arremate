# FlowOS v4 — Brain IA: Fluxo Completo e Cascata de Custo

---

## Fluxo de um Input: do Gateway ao Destino

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INPUT (usuário / evento)                     │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [1] GATEWAY — BrainRouter                                          │
│      • Classifica o input: intent, urgência, contexto               │
│      • Seleciona o modelo da cascata (veja abaixo)                  │
│      • Injeta workspace context + BrainMemory relevante             │
│      • Aplica SEC-08 (sanitização de prompt)                        │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [2] MEMORY RETRIEVAL — pgvector similarity search                  │
│      • Busca fragmentos de BrainMemory por embedding cosine         │
│      • Top-K fragmentos relevantes injetados no contexto            │
│      • TTL: 90 dias (configurável por workspace)                    │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [3] MODEL EXECUTION — cascata de custo                             │
│      Mês 1-2:   GPT-4o-mini   (gateway universal)                  │
│      Mês 3-4:   GPT-4o        (padrões complexos identificados)     │
│      Mês 5-6:   Fine-tuned    (modelo treinado no negócio)          │
│      Mês 7-12+: Local (Ollama) (custo ~$0)                         │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [4] RESPONSE PARSING — structured output                           │
│      • Zod schema valida a resposta do modelo                       │
│      • Tool-calls executadas pelo AgentRuntime                      │
│      • Ações atômicas com rollback em caso de falha                 │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [5] MEMORY WRITE — aprendizado contínuo                            │
│      • Interação bem-sucedida vira BrainMemory                      │
│      • Padrões repetidos viram FlowTemplate automático              │
│      • Batches exportados para fine-tuning mensal                   │
│      • Audit log gravado (SEC-06)                                   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DESTINO (ação / resposta)                     │
│   Deal criado | Task agendada | Flow disparado | Mensagem enviada   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Cascata de Custo: Projeção 12 Meses

Assumindo **50.000 tokens/dia** de uso do workspace médio:

| Período  | Modelo           | Custo/1M tokens | Custo/mês estimado | Economia acumulada |
|----------|------------------|-----------------|--------------------|--------------------|
| Mês 1    | gpt-4o-mini      | $0.15           | $225               | —                  |
| Mês 2    | gpt-4o-mini      | $0.15           | $225               | —                  |
| Mês 3    | gpt-4o (20% mix) | $2.50 (mix)     | $280               | —                  |
| Mês 4    | gpt-4o (10% mix) | $0.40 (mix)     | $195               | $60                |
| Mês 5    | fine-tuned mini  | $0.08           | $120               | $165               |
| Mês 6    | fine-tuned mini  | $0.08           | $120               | $285               |
| Mês 7    | local (Ollama)   | ~$0.01          | $15                | $420+              |
| Mês 8-12 | local (Ollama)   | ~$0.01          | $15/mês            | → -98% vs mês 1    |

**Conclusão:** workspaces que iniciam no mês 1 com $225/mês atingem ~$15/mês no mês 7.  
A redução de **98% é o efeito direto do ciclo**: memória → padrão → fine-tune → modelo local.

---

## Agentes Padrão do Núcleo

| Agente       | Função                                    | Skills                          |
|--------------|-------------------------------------------|---------------------------------|
| `deal-agent` | Qualifica e avança deals                  | kanban.move, task.create, email |
| `task-agent` | Prioriza tarefas no Eisenhower            | task.classify, task.assign      |
| `flow-agent` | Sugere e cria flows com base em padrões   | flow.create, flow.test          |
| `report-agent`| Gera relatórios em linguagem natural     | analytics.query, export.pdf     |
| `inbox-agent`| Triage de mensagens e criação de deals    | deal.create, contact.upsert     |

---

## Controle de Custo em Tempo Real

O `BrainMonitor` expõe métricas de custo em tempo real:

```typescript
interface BrainUsageMetrics {
  workspaceId: string
  month: string              // "2026-03"
  totalTokensUsed: number
  totalCostUsd: number
  usedBudgetPercent: number  // alerta em 80%, bloqueia em 100%
  modelBreakdown: Record<BrainModel, { tokens: number; costUsd: number }>
  memoryCacheHitRate: number // % de respostas servidas da memória
}
```

O dashboard exibe o gráfico de custo mês a mês e projeta a data estimada de migração para modelo local.
