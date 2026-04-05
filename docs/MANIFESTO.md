# FlowOS v4 — Manifesto Técnico

> **"O Linux dos Negócios"** — o template é a distro, o núcleo nunca muda.

---

## Princípio Zero

FlowOS é um sistema operacional para negócios. Como o Linux, ele tem um **kernel imutável** que qualquer "distribuição" (template de setor) pode usar sem modificar. Nenhum desenvolvedor que ler este manifesto vai confundir o que é núcleo e o que é setor.

---

## Os 7 Princípios Invioláveis

### [P-01] O Núcleo É Sagrado

O pacote `@flow-os/core` **nunca recebe código de setor**. Imobiliária, clínica, advocacia — todos são templates que sentam *em cima* do núcleo. Um Pull Request que adiciona lógica de setor ao core será **rejeitado sem discussão**.

```
ERRADO: if (sector === 'real-estate') { ... }  ← viola P-01
CERTO:  deal.meta.propertyType                  ← setor vive no meta
```

### [P-02] Deal.meta É o Campo Universal

O campo `Deal.meta: Json` absorve **qualquer especificidade de setor** sem jamais criar colunas novas no núcleo. Trocar de setor não requer migration — apenas um novo template de validação Zod.

```typescript
// Imobiliária → meta.propertyType, meta.caixaFinancing
// Clínica     → meta.patientId, meta.procedure
// Advocacia   → meta.processNumber, meta.court
// O schema Prisma não muda. Nunca.
```

### [P-03] Flows São Cidadãos de Primeira Classe

Toda automação de negócio é um `Flow`: uma lista ordenada de `FlowStep` com trigger, condição e ação. Flows são armazenados, versionados e executados pelo `FlowEngine`. **Nenhuma automação vive em código hardcoded**.

### [P-04] Agentes Têm Memória Persistente

O `AgentRuntime` executa agentes de IA que armazenam memória no `BrainMemory`. A memória transforma interações repetidas em padrões → fine-tune → modelo local. **A redução de 98% de custo em 12 meses não é especulação** — é o efeito direto desse ciclo.

### [P-05] Segurança É Estrutural, Não Opcional

Os 12 invariantes `[SEC-01]` a `[SEC-12]` são verificados em CI/CD. Um PR que viola qualquer um é bloqueado automaticamente. Segurança não é feature — é pré-condição.

### [P-06] Multi-Tenant Por Padrão

Todo registro tem `workspaceId`. O middleware de Row-Level Security (RLS) do Supabase garante isolamento de dados. **Não existe query sem filtro de tenant**.

### [P-07] Tipagem É Documentação

O código TypeScript estrito (`exactOptionalPropertyTypes: true`) é a fonte da verdade. Se compila sem erro de tipo, o contrato está correto. Comentários que repetem o que o tipo já diz serão removidos.

---

## A Metáfora Linux

| Linux          | FlowOS                          |
|----------------|---------------------------------|
| Kernel         | `@flow-os/core`                 |
| Distro         | Template de setor               |
| Shell          | Portal (Next.js)                |
| Syscall        | FlowEngine API                  |
| /etc/config    | `workspace.settings: Json`      |
| Package        | Plugin de integração            |
| Processo       | AgentRuntime job                |
| RAM            | BrainMemory (Redis/pgvector)    |

---

## Garantia de Estabilidade

O núcleo segue **Semantic Versioning** com política de zero breaking changes em minor/patch. Qualquer breaking change em `@flow-os/core` exige:

1. RFC aprovado por 2 maintainers
2. Migration guide publicado
3. Período de deprecation de 6 meses
4. Major version bump

Templates podem evoluir livremente. O kernel nunca quebra.
