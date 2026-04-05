# FlowOS v4 — Template Engine: 5 Setores, Núcleo Idêntico

Cada template é uma **distribuição do FlowOS** — configurações de stages, flows padrão, validação do `meta` e vocabulário do UI. O schema Prisma nunca muda.

---

## Como Funciona o Template Engine

```typescript
interface SectorTemplate {
  id: string
  name: string
  stages: StageConfig[]          // Pipeline Kanban do setor
  dealMetaSchema: ZodSchema      // Validação do Deal.meta
  defaultFlows: FlowDefinition[] // Automações pré-configuradas
  agentPersona: AgentPersona     // Personalidade do Brain IA
  vocabulary: UiVocabulary       // Labels do UI (deal→imóvel, client→paciente)
  reportTemplates: ReportDef[]   // Relatórios padrão do setor
}
```

---

## Template 1: Imobiliária Caixa

**ID:** `real-estate`

### Pipeline Kanban
```
Captação → Qualificação → Simulação Caixa → Documentação → Aprovação → Contrato → Chaves
```

### Deal.meta (validação Zod)
```typescript
const RealEstateMeta = z.object({
  propertyType:    z.enum(['apartment', 'house', 'commercial', 'land']),
  propertyValue:   z.number().min(0),
  caixaFinancing:  z.boolean().default(true),
  caixaProgram:    z.enum(['MCMV', 'SFH', 'SFI', 'CVA']).optional(),
  financingValue:  z.number().optional(),
  fgtsValue:       z.number().optional(),
  address:         z.object({ cep: z.string(), street: z.string(), city: z.string(), state: z.string() }),
  registryNumber:  z.string().optional(),
  sellerContact:   z.string().optional(),
})
```

### Flows Padrão
- **Auto-simulação:** quando deal entra em "Simulação Caixa" → agente calcula parcelas
- **Doc checklist:** quando deal entra em "Documentação" → cria tarefas para cada documento
- **Alerta SLA:** se deal ficou 7+ dias em "Aprovação" → notifica responsável
- **Relatório semanal:** toda segunda-feira → Brain gera resumo do pipeline

### Vocabulary
```
deal    → "Imóvel"      | contact → "Cliente"
stage   → "Etapa"       | value   → "VGV"
agent   → "Corretor IA" | flow    → "Processo"
```

---

## Template 2: Clínica Médica / Odontológica

**ID:** `clinic`

### Pipeline Kanban
```
Lead → Agendamento → Confirmação → Consulta → Tratamento → Alta → Retorno
```

### Deal.meta (validação Zod)
```typescript
const ClinicMeta = z.object({
  patientId:       z.string(),
  procedure:       z.string(),
  specialty:       z.enum(['general', 'cardiology', 'dentistry', 'orthopedics', 'dermatology']),
  healthPlan:      z.string().optional(),
  healthPlanCode:  z.string().optional(),
  appointmentDate: z.string().datetime().optional(),
  doctorId:        z.string(),
  anamnesis:       z.string().optional(), // criptografado em repouso
  consentSigned:   z.boolean().default(false),
})
```

### Flows Padrão
- **Confirmação automática:** 24h antes → SMS/WhatsApp de confirmação
- **Pós-consulta:** após "Consulta" → cria follow-up de retorno em 30 dias
- **Alerta de jejum:** para procedimentos específicos → lembrete 12h antes
- **NPS automático:** 2 dias após "Alta" → pesquisa de satisfação

### Vocabulary
```
deal    → "Paciente"     | contact → "Responsável"
stage   → "Etapa"        | value   → "Valor"
agent   → "Assistente IA"| flow    → "Protocolo"
```

---

## Template 3: Escritório de Advocacia

**ID:** `law-firm`

### Pipeline Kanban
```
Consulta → Contrato → Inicial → Em andamento → Audiência → Recurso → Encerrado
```

### Deal.meta (validação Zod)
```typescript
const LawFirmMeta = z.object({
  processNumber:   z.string().optional(),
  court:           z.string().optional(),
  subject:         z.string(),
  area:            z.enum(['civil', 'criminal', 'labor', 'tax', 'consumer', 'family', 'corporate']),
  clientRole:      z.enum(['plaintiff', 'defendant', 'accused', 'other']),
  opposingParty:   z.string().optional(),
  hearingDate:     z.string().datetime().optional(),
  deadlines:       z.array(z.object({ description: z.string(), dueDate: z.string().datetime() })).default([]),
  successFee:      z.number().optional(), // % honorário êxito
  retainerFee:     z.number().optional(), // honorário fixo
  confidential:    z.boolean().default(true),
})
```

### Flows Padrão
- **Alerta de prazo:** 5 dias antes de deadline → cria task Q1 para advogado responsável
- **Audiência próxima:** 3 dias antes → prepara resumo do caso via Brain IA
- **Honorários:** quando deal vai para "Encerrado" → gera fatura automática
- **Relatório mensal:** resumo de casos por área para sócio

### Vocabulary
```
deal    → "Processo"     | contact → "Cliente"
stage   → "Fase"         | value   → "Honorários"
agent   → "Paralegal IA" | flow    → "Rito"
```

---

## Template 4: Construtora

**ID:** `construction`

### Pipeline Kanban
```
Prospecção → Orçamento → Proposta → Contrato → Obra em andamento → Vistoria → Entrega → Pós-obra
```

### Deal.meta (validação Zod)
```typescript
const ConstructionMeta = z.object({
  projectType:     z.enum(['residential', 'commercial', 'infrastructure', 'renovation', 'industrial']),
  address:         z.object({ cep: z.string(), city: z.string(), state: z.string() }),
  area:            z.number().positive(), // m²
  estimatedValue:  z.number().positive(),
  contractedValue: z.number().optional(),
  startDate:       z.string().datetime().optional(),
  endDate:         z.string().datetime().optional(),
  architect:       z.string().optional(),
  engineerId:      z.string().optional(),
  artNumber:       z.string().optional(), // ART/RRT
  permits:         z.array(z.string()).default([]), // alvarás
  percentComplete: z.number().min(0).max(100).default(0),
})
```

### Flows Padrão
- **Marco de obra:** a cada 25% de progresso → alerta para vistoria técnica
- **Prazo de entrega:** 30 dias antes → cria checklist de finalização
- **Medição mensal:** todo dia 25 → solicita medição ao engenheiro responsável
- **Pós-obra:** 90 dias após entrega → agenda vistoria de garantia

### Vocabulary
```
deal    → "Obra"         | contact → "Cliente"
stage   → "Fase"         | value   → "Valor Contratado"
agent   → "Gestor IA"    | flow    → "Processo"
```

---

## Template 5: Hotelaria / Hospitalidade

**ID:** `hospitality`

### Pipeline Kanban
```
Consulta → Cotação → Reserva → Check-in → Hospedado → Check-out → Pós-estadia
```

### Deal.meta (validação Zod)
```typescript
const HospitalityMeta = z.object({
  guestName:       z.string(),
  checkIn:         z.string().datetime(),
  checkOut:        z.string().datetime(),
  roomType:        z.enum(['single', 'double', 'suite', 'family', 'presidential']),
  roomNumber:      z.string().optional(),
  adults:          z.number().int().min(1),
  children:        z.number().int().min(0).default(0),
  origin:          z.string().optional(), // booking.com, airbnb, direto
  specialRequests: z.string().optional(),
  mealPlan:        z.enum(['none', 'breakfast', 'half-board', 'full-board', 'all-inclusive']).default('none'),
  totalNights:     z.number().int().positive(),
  ratePerNight:    z.number().positive(),
  loyaltyTier:     z.enum(['none', 'silver', 'gold', 'platinum']).default('none'),
  checkinDone:     z.boolean().default(false),
  npsScore:        z.number().min(0).max(10).optional(),
})
```

### Flows Padrão
- **Pré-chegada:** 24h antes do check-in → email de boas-vindas com instruções
- **Upgrade automático:** se room type premium disponível → agente oferece upgrade
- **Pós-estadia:** 1 dia após check-out → NPS automático por email/WhatsApp
- **Programa de fidelidade:** quando deal fecha → calcula e credita pontos

### Vocabulary
```
deal    → "Reserva"      | contact → "Hóspede"
stage   → "Etapa"        | value   → "Diária"
agent   → "Concierge IA" | flow    → "Processo"
```

---

## Usando o Template Engine

```typescript
import { TemplateEngine } from '@flow-os/templates'

// Aplicar template ao workspace
const engine = new TemplateEngine('real-estate')
await engine.applyToWorkspace(workspaceId)

// Validar meta de um deal
const meta = engine.parseDealMeta({ propertyType: 'apartment', ... })

// Obter vocabulary para o UI
const { deal: dealLabel } = engine.getVocabulary()
// → "Imóvel"
```
