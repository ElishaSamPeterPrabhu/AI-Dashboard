import React, { useCallback, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ModusWcTypography,
  ModusWcButton,
  ModusWcIcon,
  ModusWcBadge,
  ModusWcTooltip,
} from "@trimble-oss/moduswebcomponents-react";

import { useCanvasStore } from "@/store/canvasStore";
import { useAppStore } from "@/store/appStore";
import NodePalette from "@/components/canvas/NodePalette";
import NodeConfigPanel from "@/components/canvas/NodeConfigPanel";
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
};

const DEFAULT_NODE_DATA: Record<string, Record<string, unknown>> = {
  sticky:     { text: "", color: "yellow" },
  process:    { label: "Process", description: "" },
  input:      { label: "Input", description: "", dataType: "number", value: "" },
  calculator: { label: "Calculator", formula: "" },
  output:     { label: "Result", format: "text" },
  ai:         { label: "AI Node", description: "", status: "idle" },
  chart:      { label: "Chart", chartType: "bar" },
  decision:   { label: "Decision", trueLabel: "Yes", falseLabel: "No" },
  database:   { label: "Data Store", entries: [], description: "" },
  trigger:    { label: "Start", triggerType: "manual" },
  group:      { label: "Frame" },
  assumption: { label: "Assumption", distribution: "triangular", min: 0, max: 100, mostLikely: 50 },
  loop:       { label: "Loop", maxIterations: 10 },
};

let nodeCounter = 1;
function uid(type: string) {
  return `${type}-${Date.now()}-${nodeCounter++}`;
}

export default function CanvasPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const { projects } = useAppStore();
  const {
    nodes, edges, mode, selectedNodeId,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setMode, setSelectedNodeId,
  } = useCanvasStore();

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

  const isEmpty = nodes.length === 0;

  const SUGGESTIONS = [
    { type: "ai",      label: "AI Estimator",    offsetX: 340, offsetY: 160 },
    { type: "input",   label: "Input Value",      offsetX: 160, offsetY: 280 },
    { type: "process", label: "Process Step",     offsetX: 520, offsetY: 280 },
  ];

  const handleSuggestionClick = (type: string, label: string, offsetX: number, offsetY: number) => {
    if (!rfInstance) return;
    const position = rfInstance.screenToFlowPosition({ x: offsetX, y: offsetY });
    const dims = NODE_DIMENSIONS[type] ?? { width: 160 };
    const newNode: Node = {
      id: uid(type),
      type,
      position,
      width: dims.width,
      ...(dims.height ? { height: dims.height } : {}),
      data: { ...(DEFAULT_NODE_DATA[type] ?? {}), label },
    };
    addNode(newNode);
  };

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
            <ModusWcBadge
              text={project?.name ?? ""}
              color="secondary"
              size="sm"
              customClass="flex-shrink-0"
            />
          </div>

          {/* Centre: Plan / Execute toggle (absolutely centred) */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[var(--modus-wc-color-base-200)] rounded-lg p-1">
            <ModusWcButton
              variant={mode === "plan" ? "filled" : "borderless"}
              color={mode === "plan" ? "primary" : "secondary"}
              size="sm"
              onButtonClick={() => setMode("plan")}
              aria-pressed={mode === "plan"}
            >
              <ModusWcIcon slot="start" name="edit" size="sm" decorative />
              Plan
            </ModusWcButton>
            <ModusWcTooltip text={nodes.length === 0 ? "Add nodes to enable Execute" : "Run the simulation"} position="bottom">
              <ModusWcButton
                variant={mode === "execute" ? "filled" : "borderless"}
                color={mode === "execute" ? "primary" : "secondary"}
                size="sm"
                disabled={nodes.length === 0}
                onButtonClick={() => nodes.length > 0 && setMode("execute")}
                aria-pressed={mode === "execute"}
              >
                <ModusWcIcon slot="start" name="play_arrow" size="sm" decorative />
                Execute
              </ModusWcButton>
            </ModusWcTooltip>
          </div>

          {/* Right slot: status badge */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            {mode === "execute" && (
              <ModusWcBadge text="Simulation ready" color="success" size="sm" />
            )}
          </div>
        </div>

        {/* React Flow canvas (position:relative so panel overlays work) */}
        <div ref={reactFlowWrapper} className="flex-1 relative overflow-hidden" onDragOver={onDragOver} onDrop={onDrop}>
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
            deleteKeyCode="Delete"
            proOptions={{ hideAttribution: true }}
            nodesFocusable={false}
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

          {/* ── Empty state CTA ──────────────────────────── */}
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto w-[360px]">
                <div className="ai-ux-gradient-frame">
                  <div className="ai-ux-gradient-frame__glow" aria-hidden />
                  <div className="ai-ux-gradient-frame__inner px-4 py-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="ai-ux-agent-mark-static flex-shrink-0" aria-hidden>
                        <ModusWcIcon name="ai_stars" size="md" decorative customClass="text-white" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <ModusWcTypography hierarchy="p" size="sm" weight="semibold" label="Start your workflow" customClass="m-0 text-[var(--modus-wc-color-base-content)]" />
                        <ModusWcTypography hierarchy="p" size="xs" label="Drag nodes from the left, or pick a suggestion." customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]" />
                      </div>
                    </div>

                    <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                      {SUGGESTIONS.map(({ type, label, offsetX, offsetY }) => (
                        <li key={type}>
                          <ModusWcButton
                            variant="filled"
                            color="tertiary"
                            size="sm"
                            customClass="w-full !h-auto justify-start"
                            onButtonClick={() => handleSuggestionClick(type, label, offsetX, offsetY)}
                          >
                            <span className="font-normal text-left">{label}</span>
                          </ModusWcButton>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

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
          <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--modus-wc-color-base-300)] bg-[var(--modus-wc-color-base-100)] flex-shrink-0">
            <ModusWcButton variant="filled" color="primary" size="sm">
              <ModusWcIcon slot="start" name="play_arrow" size="sm" decorative />
              Run
            </ModusWcButton>
            <ModusWcButton variant="outlined" color="secondary" size="sm" disabled>
              <ModusWcIcon slot="start" name="stop" size="sm" decorative />
              Stop
            </ModusWcButton>
            <ModusWcTypography hierarchy="p" size="xs" label="Ready to simulate · Press Run to start" customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)]" />
            <div className="flex-1" />
            <ModusWcTypography hierarchy="p" size="xs" label="Trimble AI can make mistakes. Verify critical estimates." customClass="m-0 text-[var(--modus-wc-color-base-content-low-contrast)] italic" />
          </div>
        )}
      </div>
    </div>
  );
}
