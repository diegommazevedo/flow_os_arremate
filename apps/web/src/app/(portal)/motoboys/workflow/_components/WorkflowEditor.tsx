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
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load workflow list
  const loadList = useCallback(async () => {
    const res = await fetch("/api/field-workflows");
    const data = await res.json();
    setWorkflows(data.items ?? []);
    if (!workflowId && data.items?.length > 0) {
      const active = data.items.find((w: { isActive: boolean }) => w.isActive);
      setWorkflowId(active?.id ?? data.items[0].id);
    }
  }, [workflowId]);

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

  useEffect(() => { loadList(); }, [loadList]);
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
    loadWorkflow(); // reload with fresh IDs
  };

  // Activate workflow
  const activate = async () => {
    if (!workflowId) return;
    await fetch(`/api/field-workflows/${workflowId}/activate`, { method: "POST" });
    loadList();
    loadWorkflow();
  };

  // Create default seed
  const createDefault = async () => {
    const res = await fetch("/api/field-workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Workflow Padrão", cloneFromDefault: false }),
    });
    const data = await res.json();
    if (data.id) {
      setWorkflowId(data.id);
      loadList();
    }
  };

  const selectedData = selectedNode?.data as StepNodeData | undefined;

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-4 py-2"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}>
        <Link href="/motoboys" className="text-sm" style={{ color: "var(--text-accent)" }}>
          &larr; Voltar
        </Link>
        <div className="h-5 w-px" style={{ background: "var(--border-default)" }} />

        {workflows.length > 0 ? (
          <select value={workflowId ?? ""} onChange={(e) => setWorkflowId(e.target.value)}
            className="rounded-md border px-3 py-1 text-sm"
            style={{ background: "var(--surface-base)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>{w.name} {w.isActive ? "(ativo)" : ""}</option>
            ))}
          </select>
        ) : (
          <button onClick={createDefault} className="rounded-md px-3 py-1 text-sm text-white"
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

        {/* Canvas */}
        <div className="flex-1" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
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
