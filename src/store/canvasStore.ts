import { create } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import type { AgentRunRequest, AgentRunResult } from "@/types/agent";
import { assembleInputContext, routeAgentOutputs } from "@/utils/workflowContext";
import { liveAgentRun, simulateAgentRun, useLiveAgents } from "@/utils/agentRun";

export type CanvasMode = "plan" | "execute";
export type ExecState = "idle" | "queued" | "running" | "done" | "error";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Module-level abort flag — set to true to cancel a running workflow
let _aborted = false;

/**
 * Kahn's algorithm — returns nodes in topological batches.
 * Each batch contains nodes whose upstream dependencies are all satisfied
 * by previous batches, so all nodes in a batch can run in parallel.
 *
 * Group-type nodes (group, loop) are skipped — they are containers, not
 * executable steps.
 */
function topologicalBatches(nodes: Node[], edges: Edge[]): Node[][] {
  const SKIP_TYPES = new Set(["group", "loop"]);
  const execNodes = nodes.filter((n) => !SKIP_TYPES.has(n.type ?? ""));
  const nodeMap = new Map(execNodes.map((n) => [n.id, n]));

  // Build in-degree map (only counting edges between executable nodes)
  const inDegree = new Map<string, number>(execNodes.map((n) => [n.id, 0]));
  const outEdges = new Map<string, string[]>(); // source → [targets]

  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
  }

  const batches: Node[][] = [];
  const remaining = new Set(execNodes.map((n) => n.id));

  while (remaining.size > 0) {
    // Collect all nodes with in-degree 0
    const batch = [...remaining]
      .filter((id) => (inDegree.get(id) ?? 0) === 0)
      .map((id) => nodeMap.get(id)!);

    if (batch.length === 0) {
      // Cycle detected — run remaining nodes as a final batch to avoid hanging
      batch.push(...[...remaining].map((id) => nodeMap.get(id)!));
      batches.push(batch);
      break;
    }

    batches.push(batch);

    // Remove batch nodes and decrement in-degrees of their successors
    for (const n of batch) {
      remaining.delete(n.id);
      for (const target of outEdges.get(n.id) ?? []) {
        inDegree.set(target, (inDegree.get(target) ?? 1) - 1);
      }
    }
  }

  return batches;
}

export interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  mode: CanvasMode;
  selectedNodeId: string | null;
  isExecuting: boolean;
  executionProgress: string;
  workflowId: string | null;
  scriptModalNodeId: string | null;
  /** Enriched context from Connector nodes — available to all downstream AI nodes. */
  sharedContext: Record<string, unknown>;

  setMode: (m: CanvasMode) => void;
  setWorkflowContext: (workflowId: string | null) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  setSelectedNodeId: (id: string | null) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  setScriptModal: (nodeId: string | null) => void;
  mergeSharedContext: (ctx: Record<string, unknown>) => void;

  // Execution engine
  runWorkflow: () => Promise<void>;
  stopWorkflow: () => void;
  resetExecution: () => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  mode: "plan",
  selectedNodeId: null,
  isExecuting: false,
  executionProgress: "",
  workflowId: null,
  scriptModalNodeId: null,
  sharedContext: {},

  setMode: (mode) => set({ mode }),
  setWorkflowContext: (workflowId) => set({ workflowId }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  onConnect: (connection) =>
    set((s) => ({ edges: addEdge({ ...connection, animated: false }, s.edges) })),
  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  updateNodeConfig: (id, config) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...config } } : n
      ),
    })),
  setScriptModal: (nodeId) => set({ scriptModalNodeId: nodeId }),
  mergeSharedContext: (ctx) => set((s) => ({ sharedContext: { ...s.sharedContext, ...ctx } })),

  // ── Stop a running execution ────────────────────────────
  stopWorkflow: () => {
    _aborted = true;
    set({ isExecuting: false, executionProgress: "Stopped" });
  },

  // ── Reset all execution state ───────────────────────────
  resetExecution: () => {
    set((s) => ({
      isExecuting: false,
      executionProgress: "",
      sharedContext: {},
      nodes: s.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          executionState: "idle" as ExecState,
          _result: undefined,
          _resultRaw: undefined,
          _toolCalls: undefined,
          _script: undefined,
          status: "idle",
        },
      })),
      edges: s.edges.map((e) => ({ ...e, animated: false })),
    }));
  },

  // ── Main execution engine ───────────────────────────────
  runWorkflow: async () => {
    const { nodes, edges, isExecuting } = get();
    if (isExecuting || nodes.length === 0) return;

    _aborted = false;
    set({ isExecuting: true, executionProgress: "Starting…" });

    // Helper: update node data fields
    const patchNodes = (ids: string[], patch: Record<string, unknown>) => {
      set((s) => ({
        nodes: s.nodes.map((n) =>
          ids.includes(n.id) ? { ...n, data: { ...n.data, ...patch } } : n
        ),
      }));
    };

    // Helper: toggle edge animation
    const animateEdges = (edgeIds: string[], on: boolean) => {
      set((s) => ({
        edges: s.edges.map((e) =>
          edgeIds.includes(e.id) ? { ...e, animated: on } : e
        ),
      }));
    };

    // Compute topological batches from the graph structure
    const batches = topologicalBatches(nodes, edges);
    const totalLevels = batches.length;

    // Reset all to idle first
    patchNodes(nodes.map((n) => n.id), { executionState: "idle" as ExecState });
    await sleep(200);

    for (let li = 0; li < batches.length; li++) {
      if (_aborted) break;
      const batch = batches[li];
      const batchIds = batch.map((n) => n.id);

      set({ executionProgress: `Step ${li + 1}/${totalLevels}` });

      // 1. Show as queued briefly
      patchNodes(batchIds, { executionState: "queued" as ExecState });
      await sleep(320);

      // 2. Animate INCOMING edges
      const inEdgeIds = edges
        .filter((e) => batchIds.includes(e.target))
        .map((e) => e.id);
      animateEdges(inEdgeIds, true);
      await sleep(520);

      // 3. Start running
      patchNodes(batchIds, { executionState: "running" as ExecState });
      animateEdges(inEdgeIds, false);

      const aiTypes = new Set(["ai", "connector"]);
      const nonAi = batch.filter((n) => !aiTypes.has(n.type ?? ""));
      const aiNodes = batch.filter((n) => n.type === "ai");
      // Only run Connector nodes that have at least one incoming edge
      const connectorNodes = batch.filter(
        (n) => n.type === "connector" && edges.some((e) => e.target === n.id)
      );
      // Connectors with no incoming edges — mark idle and skip quietly
      batch
        .filter((n) => n.type === "connector" && !edges.some((e) => e.target === n.id))
        .forEach((n) => patchNodes([n.id], { executionState: "idle" as ExecState }));

      // 3b. Non-AI nodes
      if (nonAi.length > 0) {
        const waitNonAi = Math.max(
          ...nonAi.map((n) => ((n.data.estimatedDuration as number) ?? 0) * 1000),
          400
        );
        await sleep(waitNonAi);
        for (const n of nonAi) {
          if (_aborted) break;

          if (n.type === "calculator") {
            const nodesNow = get().nodes;
            const edgesNow = get().edges;
            const formula = (n.data.formula as string) ?? "";
            const ctx = assembleInputContext(n.id, nodesNow, edgesNow);

            let rawValue: unknown = n.data.executionResult;
            let displayValue: string = String(n.data.executionResult ?? "");

            if (formula.trim()) {
              try {
                const keys = Object.keys(ctx);
                const vals = keys.map((k) => {
                  const v = ctx[k];
                  if (typeof v === "number") return v;
                  if (typeof v === "string") {
                    const n2 = parseFloat(v.replace(/[$,€£%\s]/g, ""));
                    return isNaN(n2) ? v : n2;
                  }
                  return v;
                });
                // eslint-disable-next-line no-new-func
                const fn = new Function(...keys, `return (${formula})`);
                rawValue = fn(...vals);
                const numVal = typeof rawValue === "number" ? rawValue : null;
                displayValue = numVal !== null
                  ? numVal.toLocaleString("en-US", { maximumFractionDigits: 2 })
                  : String(rawValue);
              } catch {
                rawValue = n.data.executionResult;
                displayValue = String(n.data.executionResult ?? "");
              }
            }

            patchNodes([n.id], {
              executionState: "done" as ExecState,
              _result: displayValue,
              _resultRaw: rawValue,
            });
          } else if (n.type === "output") {
            // Output node: pull value from the first upstream node's result
            const nodesNow = get().nodes;
            const edgesNow = get().edges;
            const ctx = assembleInputContext(n.id, nodesNow, edgesNow);
            const firstVal = Object.values(ctx).find((v) => v != null);
            const result = firstVal != null ? String(firstVal) : null;
            patchNodes([n.id], {
              executionState: "done" as ExecState,
              ...(result != null ? { _result: result, value: result } : {}),
            });
          } else if (n.type === "chart") {
            // Chart node: collect upstream context and pick keys to plot
            const nodesNow = get().nodes;
            const edgesNow = get().edges;
            const ctx = assembleInputContext(n.id, nodesNow, edgesNow);
            const chartKeys = (n.data.chartKeys as string[] | undefined) ?? [];
            // Build chart data: use chartKeys if provided, else all numeric context keys
            const numericCtx = Object.entries(ctx)
              .filter(([, v]) => {
                const num = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,€£%\s]/g, ""));
                return !isNaN(num);
              })
              .map(([k, v]) => ({
                name: k,
                value: typeof v === "number" ? v : parseFloat(String(v).replace(/[$,€£%\s]/g, "")),
              }));
            const plotData = chartKeys.length > 0
              ? numericCtx.filter((e) => chartKeys.includes(e.name))
              : numericCtx;
            patchNodes([n.id], {
              executionState: "done" as ExecState,
              _chartData: plotData,
              _result: plotData.map((e) => `${e.name}: ${e.value}`).join(", "),
            });
          } else {
            const result = n.type === "input"
              ? ((n.data.value as string) ?? n.data.executionResult)
              : n.data.executionResult;
            patchNodes([n.id], {
              executionState: "done" as ExecState,
              ...(result != null ? { _result: result } : {}),
            });
          }
        }
      }

      // 3c. AI nodes
      if (!_aborted && aiNodes.length > 0) {
        await sleep(200);
        for (const n of aiNodes) {
          if (_aborted) break;
          await runAiNode(n, get, patchNodes);
        }
      }

      // 3d. Connector nodes (only those with at least one incoming edge)
      if (!_aborted && connectorNodes.length > 0) {
        await sleep(200);
        for (const n of connectorNodes) {
          if (_aborted) break;
          await runConnectorNode(n, get, patchNodes);
        }
      }

      // 4. Animate OUTGOING edges
      const outEdgeIds = edges
        .filter((e) => batchIds.includes(e.source))
        .map((e) => e.id);
      animateEdges(outEdgeIds, true);
      await sleep(420);
      animateEdges(outEdgeIds, false);
    }

    set({ isExecuting: false, executionProgress: "Done ✓" });
  },
}));

// ── AI node runner (extracted for reuse in connector AI mode) ─────────────

async function runAiNode(
  n: Node,
  get: () => CanvasStore,
  patchNodes: (ids: string[], patch: Record<string, unknown>) => void
) {
  const nodesNow = get().nodes;
  const edgesNow = get().edges;
  const wfId = get().workflowId ?? "";
  const d = n.data as Record<string, unknown>;
  const rawPrompt = String(d.description ?? "");
  const inputContext = assembleInputContext(n.id, nodesNow, edgesNow, get().sharedContext);
  // Pre-substitute {{varName}} tokens so the agent receives final values, not placeholders.
  // This prevents the agent from trying to recalculate things already computed in the canvas.
  const systemPrompt = rawPrompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = inputContext[key];
    return v != null ? String(v) : `{{${key}}}`;
  });
  const agentId = (d.agentId as string)?.trim();
  const staticFallback = d.executionResult != null ? String(d.executionResult) : undefined;

  patchNodes([n.id], { status: "running" });

  let agentResult: AgentRunResult;
  if (useLiveAgents() && agentId) {
    const body: AgentRunRequest = {
      nodeId: n.id,
      workflowId: wfId,
      systemPrompt,
      inputContext,
    };
    agentResult = await liveAgentRun(agentId, body);
  } else {
    agentResult = await simulateAgentRun(systemPrompt, inputContext, staticFallback);
  }

  if (agentResult.status === "error") {
    patchNodes([n.id], {
      executionState: "error" as ExecState,
      status: "error",
      _result: agentResult.errorMessage ?? "Agent error",
    });
  } else {
    patchNodes([n.id], {
      executionState: "done" as ExecState,
      status: "idle",
      _result: agentResult.result,
      ...(agentResult.toolCalls?.length ? { _toolCalls: agentResult.toolCalls } : {}),
      ...(agentResult.script ? { _script: agentResult.script } : {}),
    });
    routeAgentOutputs(n.id, agentResult, get().nodes, get().edges, patchNodes);
  }

  return agentResult;
}

// ── Connector node runner ────────────────────────────────────────────────

async function runConnectorNode(
  n: Node,
  get: () => CanvasStore,
  patchNodes: (ids: string[], patch: Record<string, unknown>) => void
) {
  const nodesNow = get().nodes;
  const edgesNow = get().edges;
  const d = n.data as Record<string, unknown>;

  // Skip if no incoming edges — Connector with nothing connected should stay idle
  const hasIncoming = edgesNow.some((e) => e.target === n.id);
  if (!hasIncoming) {
    patchNodes([n.id], { executionState: "idle" as ExecState });
    return "";
  }

  const agentId = (d.agentId as string)?.trim();

  // Collect upstream context from all incoming edges
  const inputContext = assembleInputContext(n.id, nodesNow, edgesNow);

  // Always pass data through — store as _result so downstream nodes can read it
  const passResult = JSON.stringify(inputContext);

  if (agentId && useLiveAgents()) {
    // AI enrichment mode — run the agent to summarise/enrich the incoming data
    // The result is stored in sharedContext so ALL downstream AI nodes have it
    patchNodes([n.id], { status: "running" });
    const agentResult = await runAiNode(n, get, patchNodes);
    if (agentResult && agentResult.status !== "error") {
      // Merge agent's structured output into sharedContext
      const enriched: Record<string, unknown> = {
        _connector_summary: agentResult.result,
        _connector_label: (d.label as string) ?? "Connector",
        ...(agentResult.data ?? {}),
      };
      get().mergeSharedContext(enriched);
    }
  } else {
    // Pass-through — just forward the upstream context as shared context too
    get().mergeSharedContext({
      _connector_label: (d.label as string) ?? "Connector",
      ...inputContext,
    });
    patchNodes([n.id], {
      executionState: "done" as ExecState,
      _result: `→ ${(d.sectionName as string) || (d.label as string) || "next section"}`,
    });
  }

  return passResult;
}
