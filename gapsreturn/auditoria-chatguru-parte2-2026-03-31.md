REAUDITORIA FINAL — ChatGuru Parte 2 UI — 31/03/2026

P-01: LIMPO
- [C:\dev\flow_os\apps\web\src\app\chat\_components\ChatSidebar.tsx](C:\dev\flow_os\apps\web\src\app\chat\_components\ChatSidebar.tsx) agora deriva `PHASE_LABELS` de `PIPELINE_STAGES` via `@flow-os/templates` e não mantém `itbi`, `escritura` ou `registro` hardcoded no componente.
- [C:\dev\flow_os\apps\web\src\app\(portal)\settings\respostas-rapidas\page.tsx](C:\dev\flow_os\apps\web\src\app\(portal)\settings\respostas-rapidas\page.tsx) não contém mais `boleto` no placeholder.

SEC-02: LIMPO
- [C:\dev\flow_os\apps\web\src\app\api\integrations\list\route.ts](C:\dev\flow_os\apps\web\src\app\api\integrations\list\route.ts) existe, não está vazio, e o `select` retorna apenas `id`, `name`, `type`, `status` e `createdAt`, sem `config` nem secrets.

SEC-03: LIMPO
- [C:\dev\flow_os\apps\web\src\app\api\integrations\list\route.ts](C:\dev\flow_os\apps\web\src\app\api\integrations\list\route.ts) deriva `workspaceId` exclusivamente da sessão com `getSessionContext()` e filtra `db.workspaceIntegration.findMany({ where: { workspaceId: session.workspaceId, status: "ACTIVE" } })`.

TYPECHECK: LIMPO
VEREDICTO: APROVADO
