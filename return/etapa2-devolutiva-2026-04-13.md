# Devolutiva — Etapa 2 · Cockpit vs artefato v2

**Projeto:** FlowOS v4  
**Data:** 2026-04-13  
**Escopo:** Rotas cockpit + admin após migrations Railway aplicadas; comparação com `flowos_cockpit_v2.html` (artefato externo ao repo).

---

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RESUMO EXECUTIVO                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Migrations críticas (tags/campaigns, SUPER_ADMIN, deal_parallels): OK       │
│ Deploy / ambiente: validar no Railway após push                              │
│ Artefato flowos_cockpit_v2.html: não presente no repositório — paridade     │
│   visual/UX deve ser feita manualmente contra ficheiro fornecido offline   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Rotas verificadas (implementação no código)

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ Rota         │ O que existe (UI + API)                                       │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ /leads       │ LeadsTable: tabela + filtros + barra de funil (chips por     │
│              │ stage, clique / Shift+multi) + coluna Etapa + import/novo     │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ /campanhas   │ Lista em cards + "+ Nova campanha" + modal criação; detalhe  │
│              │ em /campanhas/[id]                                            │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ /motoboys    │ Tabela field agents + filtros cidade/UF + Cadastrar + link   │
│              │ Integrações; nota CSV import                                  │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ /dossies     │ Lista dossiês + filtros status/UF/score + acções share       │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ /admin/      │ Lista workspaces + "+ Novo workspace" + modal; apenas       │
│ workspaces   │ SUPER_ADMIN (senão redirect /dashboard)                       │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 2. Sidebar (navegação portal)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Fonte: apps/web/src/app/(portal)/_components/PortalSidebar.tsx               │
│ Secção "Captação e dossiê" + Leads, Campanhas, Motoboys, Dossiês             │
│ Admin visível só com role SUPER_ADMIN                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Artefato `flowos_cockpit_v2.html`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ESTADO NO REPO                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ ficheiro flowos_cockpit_v2.html → NÃO encontrado em C:\dev\flow_os          │
├─────────────────────────────────────────────────────────────────────────────┤
│ AÇÃO SUGERIDA                                                                │
│ • Colocar o HTML na pasta return/ ou docs/ para diff futuro                 │
│ • Ou anexar URL/caminho fixo na próxima devolutiva                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Gaps para paridade visual / funcional (checklist)

| # | Item | Estado |
|---|------|--------|
| G1 | Pixel-match layout cockpit vs v2 | Pendente (sem artefato no repo) |
| G2 | Estados vazios / loading / erro alinhados ao v2 | Parcial — padrão Portal vars |
| G3 | Copy e labels idênticos ao mock | Revisar com HTML aberto lado a lado |
| G4 | Cores, espaçamentos, tipografia vs v2 | Revisar com design token actual |
| G5 | Fluxos não cobertos pelo código (ex.: passos WA) | Mapear do HTML para backlog |

---

## 5. Próximos passos

1. Anexar `flowos_cockpit_v2.html` ao workspace ou indicar caminho absoluto.  
2. Screenshot ou lista “esperado vs actual” por ecrã.  
3. Priorizar G1–G5 conforme negócio.

---

**Ficheiros desta devolutiva**

| Local | Caminho |
|-------|---------|
| Repositório | `return/etapa2-devolutiva-2026-04-13.md` |
| Handoff (fora do git) | `C:\dev\return\etapa2-devolutiva-2026-04-13.md` |

---

*Gerado automaticamente na sessão Cursor — complementar com hashes de commit e prints quando disponíveis.*
