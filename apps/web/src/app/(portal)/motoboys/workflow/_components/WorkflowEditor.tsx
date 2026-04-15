"use client";

import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import Link from "next/link";
import { StepNode, type StepNodeData } from "./StepNode";
import { StepPalette } from "./StepPalette";
import { MessageEditor } from "./MessageEditor";
import { ConfigPanel } from "./ConfigPanel";

const nodeTypes = { step: StepNode };

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  steps: Array<{
    id: string;
    key: string;
    label: string;
    type: string;
    position: number;
    positionX: number;
    positionY: number;
    config: Record<string, unknown>;
    template: { name: string; body: string; variables: string[] } | null;
  }>;
  edges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    label: string | null;
    condition: unknown;
  }>;
  config: Record<string, unknown> | null;
}

function EditorInner() {
  const reactFlowInstance = useReactFlow();
  const [workflows, setWorkflows] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"detail" | "config">("detail");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  /** Recarrega a lista. `selectId` força a seleção desse workflow (ex.: recém-criado). */
  const loadList = useCallback(async (opts?: { selectId?: string | null }) => {
    const res = await fetch("/api/field-workflows");
    if (!res.ok) return;
    const data = await res.json();
    const items = (data.items ?? []) as { id: string; name: string; isActive: boolean }[];
    setWorkflows(items);
    setWorkflowId((prev) => {
      const prefer = opts?.selectId;
      if (prefer && items.some((w) => w.id === prefer)) return prefer;
      if (prev && items.some((w) => w.id === prev)) return prev;
      if (items.length === 0) return null;
      const active = items.find((w) => w.isActive);
      const first = items[0];
      return active?.id ?? first?.id ?? null;
    });
  }, []);

  const refreshWorkflowList = useCallback(async () => {
    setListRefreshing(true);
    try {
      await loadList();
    } finally {
      setListRefreshing(false);
    }
  }, [loadList]);

  useEffect(() => {
    if (!selectorOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = selectorRef.current;
      const t = e.target;
      if (el && t instanceof globalThis.Node && !el.contains(t)) setSelectorOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selectorOpen]);

  // Load full workflow
  const loadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    const res = await fetch(`/api/field-workflows/${workflowId}`);
    const data = await res.json();
    const wf = data.workflow as Workflow;
    setWorkflow(wf);

    // Convert to React Flow nodes
    const rfNodes: Node[] = wf.steps.map((s) => ({
      id: s.id,
      type: "step",
      position: { x: s.positionX, y: s.positionY },
      data: {
        key: s.key,
        label: s.label,
        type: s.type,
        template: s.template,
        config: s.config,
      } satisfies StepNodeData,
    }));
    setNodes(rfNodes);

    // Convert to React Flow edges
    const rfEdges: Edge[] = wf.edges.map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      label: e.label ?? undefined,
      style: { stroke: "var(--text-accent)" },
      labelStyle: { fill: "var(--text-secondary)", fontSize: 11 },
    }));
    setEdges(rfEdges);
  }, [workflowId, setNodes, setEdges]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => { loadWorkflow(); }, [loadWorkflow]);

  // Handle new connection
  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, style: { stroke: "var(--text-accent)" } }, eds));
  }, [setEdges]);

  // Handle node selection
  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode(node);
    setTab("detail");
  }, []);

  // Handle drop from palette
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/reactflow-type");
    const label = e.dataTransfer.getData("application/reactflow-label");
    if (!type || !reactFlowInstance) return;

    const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const key = `${type.toLowerCase()}_${Date.now()}`;

    const newNode: Node = {
      id: `temp_${Date.now()}`,
      type: "step",
      position,
      data: {
        key,
        label,
        type,
        template: type === "SEND_MESSAGE" ? { name: key, body: "", variables: [] } : null,
        config: {},
      } satisfies StepNodeData,
    };

    setNodes((nds) => [...nds, newNode]);
  }, [reactFlowInstance, setNodes]);

  // Update template body for selected node
  const updateTemplateBody = useCallback((body: string) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNode.id) return n;
        const d = n.data as StepNodeData;
        return {
          ...n,
          data: { ...d, template: { ...(d.template ?? { name: d.key, variables: [] }), body } },
        };
      }),
    );
  }, [selectedNode, setNodes]);

  // Save canvas
  const save = async () => {
    if (!workflowId) return;
    setSaving(true);

    // Build step data from nodes
    const stepsPayload = nodes.map((n, i) => {
      const d = n.data as StepNodeData;
      return {
        key: d.key,
        label: d.label,
        type: d.type,
        position: i,
        positionX: n.position.x,
        positionY: n.position.y,
        config: d.config ?? {},
        template: d.type === "SEND_MESSAGE" && d.template
          ? { name: d.template.name, body: d.template.body, variables: d.template.variables }
          : null,
      };
    });

    // Build edge data (map node IDs → step keys)
    const nodeIdToKey = new Map(nodes.map((n) => [n.id, (n.data as StepNodeData).key]));
    const edgesPayload = edges.map((e) => ({
      sourceKey: nodeIdToKey.get(e.source) ?? "",
      targetKey: nodeIdToKey.get(e.target) ?? "",
      label: typeof e.label === "string" ? e.label : null,
    })).filter((e) => e.sourceKey && e.targetKey);

    await fetch(`/api/field-workflows/${workflowId}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: stepsPayload, edges: edgesPayload }),
    });

    setSaving(false);
    void loadList();
    loadWorkflow(); // reload with fresh IDs
  };

  // Activate workflow
  const activate = async () => {
    if (!workflowId) return;
    await fetch(`/api/field-workflows/${workflowId}/activate`, { method: "POST" });
    await loadList();
    loadWorkflow();
  };

  const handleCreateWorkflow = async (name: string) => {
    const res = await fetch("/api/field-workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim().slice(0, 120) || "Novo Workflow", cloneFromDefault: false }),
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok) {
      window.alert(data.error ?? "Erro ao criar workflow");
      return;
    }
    if (!data.id) return;
    setSelectorOpen(false);
    await loadList({ selectId: data.id });
  };

  // Primeiro workflow (lista vazia)
  const createFirstWorkflow = () => void handleCreateWorkflow("Workflow Padrão");

  const selectedData = selectedNode?.data as StepNodeData | undefined;

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col">
      {/* Toolbar — z-index acima do canvas React Flow + menu absoluto */}
      <div className="relative z-[10001] flex items-center gap-3 border-b px-4 py-2"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}>
        <Link href="/motoboys" className="text-sm" style={{ color: "var(--text-accent)" }}>
          &larr; Voltar
        </Link>
        <div className="h-5 w-px" style={{ background: "var(--border-default)" }} />

        {workflows.length > 0 ? (
          <div ref={selectorRef} className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              className="flex min-w-[200px] items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm"
              style={{ background: "var(--surface-base)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              aria-expanded={selectorOpen}
              aria-haspopup="listbox"
            >
              <span className="truncate">
                {workflows.find((w) => w.id === workflowId)?.name ?? "Selecionar…"}
                {workflows.find((w) => w.id === workflowId)?.isActive ? " (ativo)" : ""}
              </span>
              <span className="shrink-0 text-xs" style={{ color: "var(--text-tertiary)" }}>▾</span>
            </button>
            <button
              type="button"
              title="Atualizar lista de workflows"
              disabled={listRefreshing}
              onClick={() => void refreshWorkflowList()}
              className="rounded-md border px-2 py-1 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-accent)", background: "var(--surface-base)" }}
            >
              ↺
            </button>
            {selectorOpen && (
              <div
                className="absolute left-0 top-full z-[9999] mt-1 max-h-[min(320px,70vh)] min-w-[260px] overflow-y-auto rounded-lg border py-1 shadow-lg"
                style={{
                  background: "var(--surface-base)",
                  borderColor: "var(--border-subtle)",
                }}
                role="listbox"
              >
                {workflows.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    role="option"
                    aria-selected={w.id === workflowId}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:opacity-90"
                    style={{
                      background: w.id === workflowId ? "var(--surface-hover)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                    onClick={() => {
                      setWorkflowId(w.id);
                      setSelectorOpen(false);
                    }}
                  >
                    <span className="truncate">{w.name}</span>
                    {w.isActive && (
                      <span className="shrink-0 text-xs" style={{ color: "var(--color-success)" }}>ativo</span>
                    )}
                  </button>
                ))}
                <div className="my-1 h-px" style={{ background: "var(--border-subtle)" }} />
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm font-medium"
                  style={{ color: "var(--text-accent)" }}
                  onClick={() => {
                    const name = window.prompt("Nome do novo workflow:", "Novo Workflow");
                    if (name === null) return;
                    void handleCreateWorkflow(name.trim() || "Novo Workflow");
                  }}
                >
                  + Novo workflow…
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={createFirstWorkflow} className="rounded-md px-3 py-1 text-sm text-white"
            style={{ background: "var(--text-accent)" }}>
            Criar Workflow
          </button>
        )}

        {workflow && (
          <>
            <span className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: "var(--surface-hover)", color: "var(--text-tertiary)" }}>
              v{workflow.version}
            </span>
            {!workflow.isActive && (
              <button onClick={activate} className="rounded-md px-3 py-1 text-xs font-medium"
                style={{ color: "var(--color-success)", border: "1px solid var(--color-success)" }}>
                Ativar
              </button>
            )}
            <button onClick={save} disabled={saving}
              className="ml-auto rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--text-accent)" }}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </>
        )}
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Palette sidebar */}
        <div className="w-[200px] shrink-0 overflow-y-auto border-r p-4"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-base)" }}>
          <StepPalette />
        </div>

        {/* Canvas — stacking abaixo da toolbar */}
        <div className="relative z-0 flex-1" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            fitView
            style={{ background: "var(--surface-base)" }}
          >
            <Background color="var(--border-subtle)" gap={20} />
            <Controls style={{ button: { background: "var(--surface-raised)", color: "var(--text-primary)", borderColor: "var(--border-subtle)" } } as never} />
            <MiniMap
              nodeColor={() => "var(--text-accent)"}
              maskColor="rgba(0,0,0,0.3)"
              style={{ background: "var(--surface-raised)" }}
            />
          </ReactFlow>
        </div>

        {/* Detail panel */}
        <div className="w-[320px] shrink-0 overflow-y-auto border-l p-4"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-base)" }}>
          {/* Panel tabs */}
          <div className="mb-4 flex gap-2">
            <button onClick={() => setTab("detail")} className="text-xs font-medium"
              style={{ color: tab === "detail" ? "var(--text-accent)" : "var(--text-tertiary)" }}>
              Detalhe
            </button>
            <button onClick={() => setTab("config")} className="text-xs font-medium"
              style={{ color: tab === "config" ? "var(--text-accent)" : "var(--text-tertiary)" }}>
              Config
            </button>
          </div>

          {tab === "config" && workflowId && <ConfigPanel workflowId={workflowId} />}

          {tab === "detail" && (
            selectedData ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Label</label>
                  <input value={selectedData.label} readOnly
                    className="w-full rounded-md border px-3 py-1.5 text-sm"
                    style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Tipo</label>
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {selectedData.type.replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>Key</label>
                  <p className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>{selectedData.key}</p>
                </div>

                {selectedData.type === "SEND_MESSAGE" && selectedData.template && (
                  <MessageEditor
                    body={selectedData.template.body}
                    variables={selectedData.template.variables}
                    onChange={updateTemplateBody}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Clique em um nó para editar
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}
