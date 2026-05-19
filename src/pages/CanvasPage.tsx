import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ModusWcTypography,
  ModusWcButton,
  ModusWcIcon,
  ModusWcBadge,
  ModusWcTabs,
} from "@trimble-oss/moduswebcomponents-react";

import { TEST_WORKFLOW } from "@/data/testWorkflow";
import { TEST_WORKFLOW_WF2 } from "@/data/testWorkflowWf2";
import { badgeColorForProjectId } from "@/utils/projectBadgeColor";
import { apiGet, apiPatch, apiDelete } from "@/api/http";
import { useCanvasStore } from "@/store/canvasStore";
import { useAppStore } from "@/store/appStore";
import NodePalette from "@/components/canvas/NodePalette";
import NodeConfigPanel from "@/components/canvas/NodeConfigPanel";
import ScriptModal from "@/components/canvas/ScriptModal";
import {
  StickyNode,
  ProcessNode,
  InputNode,
  CalculatorNode,
  OutputNode,
  AiNode,
  ChartNode,
  DecisionNode,
  DatabaseNode,
  TriggerNode,
  GroupNode,
  AssumptionNode,
  LoopNode,
  ConnectorNode,
  NODE_DIMENSIONS,
} from "@/components/nodes";

const NODE_TYPES = {
  sticky: StickyNode,
  process: ProcessNode,
  input: InputNode,
  calculator: CalculatorNode,
  output: OutputNode,
  ai: AiNode,
  chart: ChartNode,
  decision: DecisionNode,
  database: DatabaseNode,
  trigger: TriggerNode,
  group: GroupNode,
  assumption: AssumptionNode,
  loop: LoopNode,
  connector: ConnectorNode,
};

const DEFAULT_NODE_DATA: Record<string, Record<string, unknown>> = {
  sticky:     { text: "", color: "yellow" },
  process:    { label: "Process", description: "" },
  input:      { label: "Input", description: "", dataType: "number", value: "" },
  calculator: { label: "Calculator", formula: "" },
  output:     { label: "Result", format: "text" },
  ai:         { label: "AI Node", description: "", status: "idle", agentId: "", agentName: "" },
  chart:      { label: "Chart", chartType: "bar" },
  decision:   { label: "Decision", trueLabel: "Yes", falseLabel: "No" },
  database:   { label: "Data Store", entries: [], description: "" },
  trigger:    { label: "Start", triggerType: "manual" },
  group:      { label: "Frame" },
  assumption: { label: "Assumption", distribution: "triangular", min: 0, max: 100, mostLikely: 50 },
  loop:       { label: "Loop", maxIterations: 10 },
  connector:  { label: "Connector", description: "", sectionName: "", agentId: "" },
};

let nodeCounter = 1;
function uid(type: string) {
  return `${type}-${Date.now()}-${nodeCounter++}`;
}

export default function CanvasPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const { projects } = useAppStore();
  const {
    nodes, edges, mode, selectedNodeId, isExecuting, executionProgress,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setMode, setSelectedNodeId, setNodes, setEdges,
    runWorkflow, resetExecution, stopWorkflow, setWorkflowContext,
  } = useCanvasStore();

  useEffect(() => {
    setWorkflowContext(workflowId ?? null);
    return () => setWorkflowContext(null);
  }, [workflowId, setWorkflowContext]);

  const project = projects.find((p) => p.id === projectId);
  const workflow = project?.workflows.find((w) => w.id === workflowId);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ── Drag from palette ──────────────────────────────────────
  const onDragStart = useCallback((e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("application/ai-dashboard-node-type", nodeType);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/ai-dashboard-node-type");
      if (!type || !rfInstance || !reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
      const dims = NODE_DIMENSIONS[type] ?? { width: 160 };
      const newNode: Node = {
        id: uid(type),
        type,
        position,
        width: dims.width,
        ...(dims.height ? { height: dims.height } : {}),
        data: { ...(DEFAULT_NODE_DATA[type] ?? { label: type }) },
      };
      addNode(newNode);
      setSelectedNodeId(newNode.id);
    },
    [rfInstance, addNode, setSelectedNodeId]
  );

  // ── Node click → open config ───────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const onPaneClick = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);

  // Delete selected node via keyboard when config panel has focus
  const onCanvasKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
      // Don't delete if focus is inside a text input / textarea
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement).isContentEditable) return;
      setNodes(nodes.filter((n) => n.id !== selectedNodeId));
      setEdges(edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, nodes, edges, setNodes, setEdges, setSelectedNodeId]);

  const isEmpty = nodes.length === 0;

  const workflowModeTabs = useMemo(
    () => [
      { label: "Plan", icon: "edit", iconPosition: "left" as const },
      {
        label: "Execute",
        icon: "play_arrow",
        iconPosition: "left" as const,
        disabled: nodes.length === 0,
      },
    ],
    [nodes.length],
  );

  const onWorkflowModeTabChange = useCallback(
    (e: CustomEvent<{ previousTab: number; newTab: number }>) => {
      const idx = e.detail.newTab;
      if (idx === 0) setMode("plan");
      else if (idx === 1 && nodes.length > 0) setMode("execute");
    },
    [nodes.length, setMode],
  );

  // ── Load the test workflow ──────────────────────────────
  const loadTestWorkflow = () => {
    resetExecution();
    const wf = workflowId === "wf2" ? TEST_WORKFLOW_WF2 : TEST_WORKFLOW;
    setNodes(wf.nodes as unknown as Node[]);
    setEdges(wf.edges.map((e) => ({ ...e, animated: false })));
  };

  // Load persisted canvas from API when opening a workflow
  useEffect(() => {
    if (!workflowId) return;
    setCanvasReady(false);
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<{ nodes: Node[]; edges: Edge[] }>(
          `/api/workflows/${workflowId}/canvas`
        );
        if (cancelled) return;
        const loadedNodes = Array.isArray(data.nodes) ? data.nodes : [];
        const loadedEdges = Array.isArray(data.edges) ? data.edges : [];
        setNodes(loadedNodes);
        setEdges(loadedEdges.map((e) => ({ ...e, animated: false })));
        resetExecution();
        // Auto-fit after nodes are set — slight delay lets React Flow measure node sizes first
        if (loadedNodes.length > 0) {
          setTimeout(() => rfInstance?.fitView({ padding: 0.12, duration: 400 }), 120);
        }

        // Check for pending input from a Connector node in another workflow
        try {
          const pending = await apiGet<{
            context: Record<string, unknown>;
            sourceWorkflowId?: string;
            sourceNodeLabel?: string;
          } | null>(`/api/workflows/${workflowId}/pending-input`);

          if (pending?.context && !cancelled) {
            // Pre-populate Input nodes whose `description` matches a context key
            const ctx = pending.context;
            const currentNodes = useCanvasStore.getState().nodes;
            const seededNodes = currentNodes.map((n) => {
              if (n.type !== "input") return n;
              const key = (n.data.description as string)?.trim();
              if (!key || !(key in ctx)) return n;
              return { ...n, data: { ...n.data, value: String(ctx[key]) } };
            });
            setNodes(seededNodes);
            // Clear pending input so it doesn't re-apply on next load
            void apiDelete(`/api/workflows/${workflowId}/pending-input`).catch(() => {});
          }
        } catch {
          /* pending input endpoint unavailable */
        }
      } catch {
        /* API offline */
      } finally {
        if (!cancelled) setCanvasReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId, setNodes, setEdges, resetExecution]);

  // Debounced save (skip until initial hydration finished)
  useEffect(() => {
    if (!workflowId || !canvasReady) return;
    const t = window.setTimeout(() => {
      // Strip ephemeral execution state before persisting — only save config data
      const nodesToSave = nodes.map((n) => {
        const { _result, _resultRaw, _toolCalls, _script, executionState, status, ...data } = n.data as Record<string, unknown>;
        void _result; void _resultRaw; void _toolCalls; void _script; void executionState; void status;
        return { ...n, data };
      });
      void apiPatch(`/api/workflows/${workflowId}/canvas`, { nodes: nodesToSave, edges }).catch(() => {});
    }, 2000);
    return () => window.clearTimeout(t);
  }, [workflowId, nodes, edges]);

  return (
    <div className="flex h-full overflow-hidden bg-[var(--modus-wc-color-base-page)]">

      {/* ── Left palette ─────────────────────────────────── */}
      <div className="flex-shrink-0 border-r border-[var(--modus-wc-color-base-300)] flex flex-col overflow-hidden" style={{ width: 156 }}>
        <NodePalette onDragStart={onDragStart} />
      </div>

      {/* ── Canvas area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top toolbar: name left | toggle centre | right slot */}
        <div className="relative flex items-center px-4 py-2 border-b border-[var(--modus-wc-color-base-300)] flex-shrink-0 bg-[var(--modus-wc-color-base-page)]" style={{ minHeight: 44 }}>
          {/* Left: workflow name + project badge */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ModusWcIcon name="schema" size="sm" decorative customClass="text-[var(--modus-wc-color-primary)] flex-shrink-0" />
            <ModusWcTypography
              hierarchy="p"
              size="sm"
              weight="semibold"
              label={workflow?.name ?? "Workflow"}
              customClass="m-0 text-[var(--modus-wc-color-base-content)] truncate"
            />
            {project && (
              <ModusWcBadge
                color={badgeColorForProjectId(project.id)}
                size="sm"
                customClass="nf-canvas-project-badge"
                title={project.name}
              >
                {project.name.length > 18 ? `${project.name.slice(0, 18)}…` : project.name}
              </ModusWcBadge>
            )}
          </div>

          {/* Centre: Plan / Execute (modus-wc-tabs) */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
            <ModusWcTabs
              aria-label="Workflow mode"
              size="sm"
              tabStyle="boxed"
              activeTabIndex={mode === "plan" ? 0 : 1}
              tabs={workflowModeTabs}
              onTabChange={onWorkflowModeTabChange}
            />
          </div>

          {/* Right slot: empty canvas helper + execute badge */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            {isEmpty && (
              <ModusWcButton variant="outlined" color="tertiary" size="sm" onButtonClick={loadTestWorkflow}>
                <ModusWcIcon slot="start" name="schema" size="sm" decorative />
                Load test workflow
              </ModusWcButton>
            )}
            {mode === "execute" && (
              <ModusWcBadge color="success" size="sm">
                Simulation ready
              </ModusWcBadge>
            )}
          </div>
        </div>

        {/* React Flow canvas (position:relative so panel overlays work) */}
        <div ref={reactFlowWrapper} className="flex-1 relative overflow-hidden" onDragOver={onDragOver} onDrop={onDrop} onKeyDown={onCanvasKeyDown} tabIndex={-1}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setRfInstance}
            fitView
            deleteKeyCode={["Delete", "Backspace"]}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.5}
              color="#4a5568"
            />
            <Controls />
            {nodes.length > 8 && <MiniMap nodeStrokeWidth={3} pannable zoomable />}
          </ReactFlow>

          {/* ── Right config panel: absolute overlay ─────── */}
          <div
            className="absolute top-0 right-0 h-full w-72 overflow-hidden pointer-events-none"
            style={{
              transform: selectedNode ? "translateX(0)" : "translateX(100%)",
              transition: "transform 200ms ease-out",
              pointerEvents: selectedNode ? "auto" : "none",
            }}
          >
            {selectedNode && (
              <NodeConfigPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} />
            )}
          </div>
        </div>

        {/* Execute mode bottom bar */}
        {mode === "execute" && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--modus-wc-color-base-300)] bg-[var(--modus-wc-color-base-100)] flex-shrink-0">
            <ModusWcButton
              variant="filled" color="primary" size="sm"
              disabled={isExecuting}
              onButtonClick={() => runWorkflow()}
            >
              <ModusWcIcon slot="start" name="play_arrow" size="sm" decorative />
              {isExecuting ? "Running…" : "Run"}
            </ModusWcButton>
            <ModusWcButton
              variant="filled" color="danger" size="sm"
              disabled={!isExecuting}
              onButtonClick={() => stopWorkflow()}
            >
              <ModusWcIcon slot="start" name="stop_circle" size="sm" decorative />
              Stop
            </ModusWcButton>
            <ModusWcButton
              variant="outlined" color="tertiary" size="sm"
              disabled={isExecuting}
              onButtonClick={() => resetExecution()}
            >
              <ModusWcIcon slot="start" name="refresh" size="sm" decorative />
              Reset
            </ModusWcButton>
            <ModusWcTypography
              hierarchy="p" size="xs"
              label={executionProgress || "Ready · Press Run to simulate"}
              customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]"
            />
            <div className="flex-1" />
            <ModusWcTypography hierarchy="p" size="xs" label="AI estimates may vary. Verify critical results." customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)] italic" />
          </div>
        )}
      </div>
      <ScriptModal />
    </div>
  );
}
