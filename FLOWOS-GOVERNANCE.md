# FLOWOS-GOVERNANCE.md

> Documento de Governo, Escopo e Visão Arquitetural  
> Operador: EcoDocs Tecnologia Sustentável  
> Fundadores: Diego Azevedo + Neemias Almeida  
> Versão: 1.0 — 07/04/2026  
> **Este arquivo é lei. Qualquer IA, IDE, engenheiro ou colaborador que tocar neste projeto lê este documento primeiro.**

---

## 1. O QUE É O FLOWOS

FlowOS é um **Universal Business Operating System** — um SaaS Framework expansível, universal e multi-template, capaz de se tornar qualquer solução B2B para qualquer organização: pessoas, processos, serviços e produtos.

FlowOS **não é**:

- Um software específico para um cliente
- Um ERP vertical
- Uma ferramenta no-code de interface
- Um produto acabado

FlowOS **é**:

- O núcleo (kernel) que se **desdobra** em soluções via templates
- A infraestrutura sobre a qual qualquer solução B2B pode ser construída
- Um framework que oculta ou expande módulos e micromódulos por configuração
- A camada abaixo de qualquer aplicação de gestão empresarial

**Metáfora fundacional:** FlowOS é para SaaS o que Linux é para sistemas operacionais. O template é a distro. O kernel não muda — o que muda é o conjunto de módulos ativados para cada tenant.

---

## 2. PRIMITIVOS UNIVERSAIS — O·P·P·P

Toda organização humana opera sobre quatro primitivos. O FlowOS os implementa no schema base. Toda entidade do sistema deriva deles.

| Primitivo | Significado | Exemplos |
|-----------|-------------|----------|
| **O** — Organization | Quem somos | Empresa, filial, holding, CNPJ |
| **P** — Person | Quem opera | Funcionário, cliente, parceiro |
| **P** — Process | Como operamos | Fluxo, jornada, automação, workflow |
| **P** — Product | O que entregamos | Serviço, bem, resultado, entrega |

**Regra inviolável:** nenhum template reescreve os primitivos. O template apenas configura — nunca substitui — O·P·P·P.

---

## 3. VOCABULÁRIO OFICIAL

| Termo | Definição |
|-------|-----------|
| **FlowOS** | O framework universal |
| **Template** | Descriptor JSON setorial — a "distro" |
| **Desdobramento** | Ato de instanciar um template para um tenant |
| **Tenant** | Organização licenciada no FlowOS |
| **Workspace** | Instância operacional de um tenant |
| **Módulo** | Agrupamento funcional mapeado a uma dimensão do negócio |
| **Micromódulo** | Unidade mínima de funcionalidade dentro de um módulo |
| **Module Registry** | Registro central de todos os módulos/micromódulos do kernel |
| **Federation Link** | Vínculo declarado entre workspaces soberanos |
| **FIL** | Financial Integration Layer — camada de integração financeira |

---

## 4. ARQUITETURA DE MÓDULOS E MICROMÓDULOS

### Estados de um módulo

- **OCULTO** — existe no kernel, invisível ao tenant
- **ATIVO** — visível e operacional
- **EXPANDIDO** — micromódulos adicionais habilitados

### Module Registry

Arquivo central no kernel que declara todos os módulos e micromódulos disponíveis. O template referencia esse registry para ativar apenas o que o tenant licenciou.

```json
{
  "moduleId": "erp-varejo",
  "label": "ERP Empresarial — Varejo",
  "micromodules": [
    { "id": "boleto-auto",      "active": true  },
    { "id": "agente-pedidos",   "active": true  },
    { "id": "contador-fiscal",  "active": false },
    { "id": "gestao-estoque",   "active": true  },
    { "id": "nfe-automatica",   "active": true  }
  ]
}
```

### Regra de extensão

Todo novo módulo ou micromódulo deve ser declarado no Module Registry antes de ser implementado. Nenhuma funcionalidade existe fora do registry.

---

## 5. MULTITENANT — ARQUITETURA DE ISOLAMENTO

### Estratégia: Row Level Security (RLS) no PostgreSQL

- Supabase RLS nativo ativado em todas as tabelas
- Cada query Prisma carrega `workspaceId` obrigatoriamente
- Nenhum dado de tenant A é acessível ao tenant B em hipótese alguma
- Autenticação unificada via Supabase — um usuário pode pertencer a múltiplos workspaces

### Por que RLS e não schemas separados

Schemas separados por tenant são inviáveis em escala — exigem migration individual por cliente. RLS escala para N tenants sem overhead operacional.

---

## 6. FEDERAÇÃO DE WORKSPACES

### Princípio fundamental

Juridicamente separados → tecnicamente separados.  
O vínculo existe **somente** para consolidação.  
Sem consolidação, não há justificativa para o vínculo.

### Workspace Soberano

Cada workspace é independente:

- CNPJ próprio
- Dados isolados por RLS
- Billing próprio
- Licenças próprias
- Pode existir sem nenhuma federação

### Federation Link

Vínculo declarado explicitamente pelo gestor. Nunca automático.

```typescript
FederationLink {
  id
  workspaceOriginId   // quem declara o vínculo
  workspaceTargetId   // quem é vinculado
  type: HOLDING | GRUPO | PARCERIA
  permissions: {
    consolidatedReports: boolean
    kpiVisibility: boolean
    sharedCatalog: boolean
    dataTransfer: boolean
  }
  createdBy, createdAt
  status: ACTIVE | SUSPENDED | REVOKED
}
```

### Consolidação

- Ocorre em **query-time**, nunca em write-time
- Dados nunca são mesclados no storage
- RLS garante: só consolida quem tem FederationLink ativo com permissão declarada

---

## 7. FINANCIAL INTEGRATION LAYER (FIL)

FlowOS não depende de nenhum gateway financeiro. FlowOS **orquestra** qualquer gateway.

### Camadas

1. **Gateway Adapters** — Asaas, Stripe, PagSeguro, Mercado Pago, [N outros]
2. **Open Finance Bridge** — ecossistema Open Finance BR, leitura e iniciação de pagamento
3. **Webhook Orchestrator** — normaliza webhooks de qualquer gateway para evento FlowOS padrão
4. **Financial Event Bus** — eventos financeiros internos independentes do gateway de origem

### Regra

Módulos do FlowOS consomem **eventos financeiros normalizados** — nunca chamadas diretas a gateways específicos. Trocar de gateway não quebra nenhum módulo.

---

## 8. SUPORTE — ARQUITETURA IA

### Níveis

| Nível | Agente | Cobertura | Escalonamento |
|-------|--------|-----------|---------------|
| N1 | Support Agent | 80%+ dos tickets | Automático para N2 |
| N2 | Diagnostic Agent | Problemas técnicos complexos | Manual para N3 |
| N3 | Diego / Neemias | O que N2 não resolve | — |

### Knowledge Loop

Cada ticket resolvido alimenta a base de conhecimento → treina N1 e N2 → com o tempo, N3 tende a zero.

### Clareza importante

Suporte primariamente IA. Escalonamento humano criterioso para casos que exigem julgamento de negócio ou crise. Não é zero humano — é zero desperdício humano.

---

## 9. LICENCIAMENTO — MODELO SELF-SERVICE

### Filosofia

Autonomia total do tenant. Sem burocracia. Sem aprovação manual para ativar módulos.

### Tiers

- **Nucleus** — workspace base, autenticação, painel (freemium/entrada)
- **Módulo** — ativação imediata, cobrança por módulo/mês
- **Micromódulo** — incluso no módulo ou custo adicional declarado
- **Consumo** — WhatsApp, tokens IA, storage cobrados por uso real

### Fluxo

Tenant ativa no painel → cobrança inicia → desativa a qualquer momento → fatura consolidada mensal.

---

## 10. INVARIANTES DE SEGURANÇA

Estas regras são **invioláveis**. Nenhuma feature, prazo ou pressão de cliente as suspende.

| Código | Regra |
|--------|-------|
| **SEC-03** | `workspaceId` obrigatório em toda query Prisma |
| **SEC-06** | `AuditLog` restrito a `create()` — nunca update ou delete |
| **SEC-08** | `defaultSanitizer.clean()` em todo texto externo antes de persistir |

---

## 11. STACK TÉCNICA

### Kernel (imutável entre versões)

- **Frontend:** Next.js 15 + App Router + TypeScript strict
- **ORM:** Prisma 5.22.0 + PostgreSQL 16
- **Auth:** Supabase (magic link + senha)
- **Filas:** BullMQ + Redis
- **Storage:** MinIO S3-compatible
- **WhatsApp:** Evolution API v2.2.3
- **Deploy:** Railway + Dockerfile custom

### Camadas expansíveis (crescem por versão)

- Module Registry
- Financial Integration Layer
- Federation Link Engine
- Support Agent Stack (N1/N2/N3)
- Template Builder
- License Manager
- Marketplace Engine

---

## 12. ROADMAP MACRO

| Versão | Nome | Foco principal |
|--------|------|----------------|
| **v4** | Kernel Vivo | Bruno em produção. Kernel validado. Onboarding Fase 1. |
| **v5** | Foundation | Module Registry. License Manager. FIL v1. Federation Link. Support N1. |
| **v6** | Scale | Open Finance. Self-service total. Support N2. Marketplace v1. |
| **v7+** | Builder-All | Tenant cria templates. Parceiros publicam. FlowOS = plataforma de plataformas. |

### Critério de avanço entre versões

Uma versão está pronta para a próxima quando:

1. Todos os grupos de configuração estão fechados
2. Ao menos um tenant real valida as features em produção
3. Nenhuma invariante de segurança foi violada
4. O Module Registry está atualizado

---

## 13. DECISÕES ESTRATÉGICAS ABERTAS

Estas decisões são **intencionais** — serão tomadas com base em evidências, não em antecipação.

### Open Core vs Fechado

**Status:** aberta. Decidir após validação do v4 com Bruno Lucarelli em produção.  
**Candidato:** modelo open core — kernel open source + camadas enterprise fechadas (FIL, Federation, Brain IA, License Manager).  
**Motivação:** comunidade open source como multiplicador de distribuição e contribuição. Modelo já validado por GitLab, Supabase, Elastic.  
**Não esquecer:** esta decisão define o teto de impacto do FlowOS no mundo.

### Billing multi-gateway

**Status:** aberta. FIL será implementado no v5. Prioridade de gateways a definir com base nos primeiros tenants.

---

## 14. PRINCÍPIO DO GUARDIÃO

> Nenhuma feature entregue a um tenant pode criar acoplamento que impeça o próximo desdobramento.  
> Cada linha de código deve ser válida para qualquer vertical, qualquer país, qualquer tenant futuro.  
> O kernel não muda — expande.  
> Nenhum atalho que crie débito estrutural é aceito, independentemente de prazo ou pressão.

**Antes de resolver qualquer erro:** mapear a família completa de erros do mesmo contexto. Nunca corrigir um sintoma sem levantar a cabeça. Em builds: ler toda a estrutura antes de escrever qualquer arquivo de configuração.

---

## 15. CONTEXTO ATUAL — v4 EM DEPLOY

- **Cliente demo:** Bruno Lucarelli (arrematadorcaixa.com.br)
- **Repo:** diegommazevedo/flow_os_arremate (branch: main)
- **URL prod:** https://flowos-web-production.up.railway.app
- **DB prod:** gondola.proxy.rlwy.net:49342/railway

### Grupos de configuração

| Grupo | Status |
|-------|--------|
| 1 — PostgreSQL | Concluído |
| 2 — Redis | Concluído |
| 3 — App URLs | Concluído |
| 4 — Supabase Auth | Concluído |
| 5 — Evolution API | Crítico para demo |
| 7 — Secrets segurança | Bloqueante |
| 8 — Brain IA | Importante |
| 9 — Email SMTP | Opcional |
| 10 — Migrations prod | Pendente |

---

*Este documento é versionado no repositório. Toda decisão arquitetural relevante tomada em qualquer sessão de trabalho deve ser refletida aqui via commit. A IA da ocasião se reconstitui a partir do que está escrito aqui — não há memória na nuvem. Este arquivo é a maleta da **lei**.*

*Complemento operacional (como plugar skills, rules locais e playbooks nas ferramentas): **`docs/MALETA-OPERADOR.md`**.*
