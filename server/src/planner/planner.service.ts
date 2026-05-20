import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { ScriptRunnerService } from "../mcp/script-runner.service";
import { StoreService } from "../store/store.service";
import type { AgentRunRequestDto } from "../agents/agents.service";
import { TrimbleAgentsService } from "../agents/agents.service";
import {
  assembleInputContext,
  patchNodesData,
  routeAgentOutputs,
  topologicalBatches,
  type WfEdge,
  type WfNode,
} from "./workflow-graph";
import { DemoRunService } from "./demo-run.service";

function coerceContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "number") out[k] = v;
    else if (typeof v === "string") {
      const n2 = parseFloat(v.replace(/[$,€£%\s]/g, ""));
      out[k] = Number.isNaN(n2) ? v : n2;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function stripExecutionState(nodes: WfNode[]): WfNode[] {
  return nodes.map((n) => {
    const d = { ...(n.data ?? {}) };
    delete d.executionState;
    delete d._result;
    delete d._resultRaw;
    delete d._toolCalls;
    delete d._script;
    delete d.status;
    return { ...n, data: d };
  });
}

function normalizeIncomingNode(raw: Record<string, unknown>): WfNode {
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `n-${randomUUID().slice(0, 8)}`;
  const type = typeof raw.type === "string" ? raw.type : "default";
  const pos = raw.position as { x?: number; y?: number } | undefined;
  const position = {
    x: typeof pos?.x === "number" ? pos.x : 0,
    y: typeof pos?.y === "number" ? pos.y : 0,
  };
  const data =
    raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
      ? (raw.data as Record<string, unknown>)
      : {};
  return { id, type, position, data };
}

@Injectable()
export class PlannerService {
  constructor(
    private readonly store: StoreService,
    private readonly agents: TrimbleAgentsService,
    private readonly scriptRunner: ScriptRunnerService,
    @Inject(forwardRef(() => DemoRunService))
    private readonly demoRun: DemoRunService
  ) {}

  listTools() {
    return [
      {
        name: "create_workflow",
        description:
          "Create a new empty workflow under a project. Returns workflow id for add_node / connect_nodes / execute_workflow.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Project id (e.g. p1)" },
            name: { type: "string" },
            description: { type: "string" },
          },
          required: ["projectId", "name"],
        },
      },
      {
        name: "add_node",
        description:
          "Append a React-Flow-shaped node to a workflow canvas (id, type, position, data).",
        inputSchema: {
          type: "object",
          properties: {
            workflowId: { type: "string" },
            node: { type: "object", description: "{ id?, type, position?: {x,y}, data? }" },
          },
          required: ["workflowId", "node"],
        },
      },
      {
        name: "connect_nodes",
        description: "Add a directed edge between two node ids on a workflow canvas.",
        inputSchema: {
          type: "object",
          properties: {
            workflowId: { type: "string" },
            source: { type: "string" },
            target: { type: "string" },
            id: { type: "string", description: "Optional edge id" },
          },
          required: ["workflowId", "source", "target"],
        },
      },
      {
        name: "execute_workflow",
        description:
          "Run the workflow server-side: topological order, calculator/input paths, Trimble agents for AI/connector when configured (else mock). Persists node results to the canvas store.",
        inputSchema: {
          type: "object",
          properties: { workflowId: { type: "string" } },
          required: ["workflowId"],
        },
        _meta: {
          ui: {
            resourceUri: "ui://workflow-canvas",
          },
        },
      },
      {
        name: "get_canvas",
        description:
          "Return the current nodes and edges for an existing workflow canvas. Call this before update_node to see existing node ids and current values.",
        inputSchema: {
          type: "object",
          properties: { workflowId: { type: "string" } },
          required: ["workflowId"],
        },
      },
      {
        name: "update_node",
        description:
          "Patch data fields on an existing node (e.g. change an input value or formula). Does not change node type or position. Call execute_workflow afterwards to re-run with updated values.",
        inputSchema: {
          type: "object",
          properties: {
            workflowId: { type: "string" },
            nodeId: { type: "string", description: "The node id to update (same as the id used in add_node)" },
            data: {
              type: "object",
              description: "Fields to merge into node.data — e.g. { \"value\": 6 } to change an input, { \"formula\": \"a+b\" } to change a calculator",
            },
          },
          required: ["workflowId", "nodeId", "data"],
        },
      },
    ];
  }

  toolCreateWorkflow(args: { projectId: string; name: string; description?: string }) {
    const wf = this.store.addWorkflow(args.projectId, {
      name: args.name,
      description: args.description,
    });
    if (!wf) throw new NotFoundException(`project ${args.projectId} not found`);
    this.store.saveCanvas(wf.id, { nodes: [], edges: [] });
    return { workflowId: wf.id, name: wf.name, projectId: args.projectId };
  }

  toolAddNode(args: { workflowId: string; node: Record<string, unknown> }) {
    const found = this.store.findWorkflowById(args.workflowId);
    if (!found) throw new NotFoundException(`workflow ${args.workflowId} not found`);
    const canvas = this.store.getCanvas(args.workflowId);
    const nodes = [...(canvas.nodes as WfNode[])];
    const next = normalizeIncomingNode(args.node);
    if (nodes.some((n) => n.id === next.id)) {
      throw new ConflictException(`node id already exists: ${next.id}`);
    }
    nodes.push(next);
    this.store.saveCanvas(args.workflowId, { nodes, edges: canvas.edges as WfEdge[] });
    this.store.touchWorkflow(found.projectId, args.workflowId);
    return { ok: true, nodeId: next.id, nodeCount: nodes.length };
  }

  toolConnectNodes(args: {
    workflowId: string;
    source: string;
    target: string;
    id?: string;
    sourceHandle?: string;
    targetHandle?: string;
  }) {
    const found = this.store.findWorkflowById(args.workflowId);
    if (!found) throw new NotFoundException(`workflow ${args.workflowId} not found`);
    const canvas = this.store.getCanvas(args.workflowId);
    const nodes = canvas.nodes as WfNode[];
    if (!nodes.some((n) => n.id === args.source)) {
      throw new BadRequestException(`unknown source node ${args.source}`);
    }
    if (!nodes.some((n) => n.id === args.target)) {
      throw new BadRequestException(`unknown target node ${args.target}`);
    }
    const edges = [...(canvas.edges as WfEdge[])];
    const edgeId =
      args.id?.trim() ||
      `e-${args.source}-${args.target}-${randomUUID().slice(0, 6)}`;
    if (edges.some((e) => e.id === edgeId)) {
      throw new ConflictException(`edge id already exists: ${edgeId}`);
    }
    edges.push({
      id: edgeId,
      source: args.source,
      target: args.target,
      sourceHandle: args.sourceHandle ?? null,
      targetHandle: args.targetHandle ?? null,
    });
    this.store.saveCanvas(args.workflowId, { nodes, edges });
    this.store.touchWorkflow(found.projectId, args.workflowId);
    return { ok: true, edgeId, edgeCount: edges.length };
  }

  async toolExecuteWorkflow(args: { workflowId: string }) {
    const found = this.store.findWorkflowById(args.workflowId);
    if (!found) throw new NotFoundException(`workflow ${args.workflowId} not found`);
    const canvas = this.store.getCanvas(args.workflowId);
    let nodes = structuredClone(canvas.nodes) as WfNode[];
    const edges = structuredClone(canvas.edges) as WfEdge[];

    nodes = stripExecutionState(nodes);
    let sharedContext: Record<string, unknown> = {};

    const batches = topologicalBatches(nodes, edges);
    const doneIds: string[] = [];

    for (let li = 0; li < batches.length; li++) {
      const batch = batches[li];
      const idleConnectors = batch.filter(
        (n) => n.type === "connector" && !edges.some((e) => e.target === n.id)
      );
      nodes = patchNodesData(
        nodes,
        idleConnectors.map((n) => n.id),
        { executionState: "idle" }
      );

      const aiTypes = new Set(["ai", "connector"]);
      const nonAi = batch.filter((n) => !aiTypes.has(n.type ?? ""));
      const aiNodes = batch.filter((n) => n.type === "ai");
      const connectorNodes = batch.filter(
        (n) => n.type === "connector" && edges.some((e) => e.target === n.id)
      );

      for (const n of nonAi) {
        if (n.type === "calculator") {
          const d = (nodes.find((x) => x.id === n.id) ?? n).data ?? {};
          const formula = String(d.formula ?? "").trim();
          const ctx = assembleInputContext(n.id, nodes, edges);
          const coerced = coerceContext(ctx);
          let rawValue: unknown = d.executionResult;
          let displayValue = String(d.executionResult ?? "");

          if (formula) {
            const { result, error } = this.scriptRunner.execute(formula, coerced);
            if (!error) {
              rawValue = result;
              const numVal = typeof result === "number" ? result : null;
              displayValue =
                numVal !== null
                  ? numVal.toLocaleString("en-US", { maximumFractionDigits: 2 })
                  : String(result);
            }
          }

          nodes = patchNodesData(nodes, [n.id], {
            executionState: "done",
            _result: displayValue,
            _resultRaw: rawValue,
          });
          doneIds.push(n.id);
        } else {
          const cur = nodes.find((x) => x.id === n.id) ?? n;
          const d = cur.data ?? {};
          let result: unknown =
            cur.type === "input"
              ? (d.value ?? d.executionResult)
              : d.executionResult;

          // output nodes: pull first upstream value when no explicit result is set
          if (result == null && cur.type === "output") {
            const upstreamCtx = assembleInputContext(n.id, nodes, edges);
            const upstreamValues = Object.values(upstreamCtx).filter((v) => v != null);
            if (upstreamValues.length > 0) result = upstreamValues[upstreamValues.length - 1];
          }

          nodes = patchNodesData(nodes, [n.id], {
            executionState: "done",
            ...(result != null ? { _result: result } : {}),
          });
          if (result != null) doneIds.push(n.id);
          else if (cur.type === "trigger" || cur.type === "output") doneIds.push(n.id);
        }
      }

      for (const n of aiNodes) {
        const cur = nodes.find((x) => x.id === n.id) ?? n;
        const d = cur.data ?? {};
        const systemPrompt = String(d.description ?? "");
        const inputContext = assembleInputContext(n.id, nodes, edges, sharedContext);
        const agentId = String(d.agentId ?? "").trim();
        const dto: AgentRunRequestDto = {
          nodeId: n.id,
          workflowId: args.workflowId,
          systemPrompt,
          inputContext,
        };
        const run = await this.agents.run(agentId || "planner-mock", dto);
        if (run.status === "error") {
          nodes = patchNodesData(nodes, [n.id], {
            executionState: "error",
            status: "error",
            _result: run.errorMessage ?? "Agent error",
          });
        } else {
          // If agent produced no text but ran tool calls, use the last script result as summary
          const aiText = run.result?.trim()
            || (run.toolCalls?.length
              ? (() => {
                  const last = run.toolCalls[run.toolCalls.length - 1];
                  const val = (last as { result?: unknown }).result;
                  const script = (last as { script?: string }).script;
                  if (val != null) return `${script ?? "result"} = ${String(val)}`;
                  return "";
                })()
              : "");
          nodes = patchNodesData(nodes, [n.id], {
            executionState: "done",
            status: "idle",
            _result: aiText,
            ...(run.toolCalls?.length ? { _toolCalls: run.toolCalls } : {}),
            ...(run.script ? { _script: run.script } : {}),
          });
          nodes = routeAgentOutputs(n.id, run, nodes, edges);
        }
        doneIds.push(n.id);
      }

      for (const n of connectorNodes) {
        const cur = nodes.find((x) => x.id === n.id) ?? n;
        const d = cur.data ?? {};
        const inputContext = assembleInputContext(n.id, nodes, edges);
        const agentId = String(d.agentId ?? "").trim();

        // Always merge raw upstream values into sharedContext so downstream AI nodes
        // receive them even when the connector agent's response doesn't echo them back.
        const upstreamFlat: Record<string, unknown> = { ...inputContext };

        if (agentId && this.agents.isConfigured) {
          const dto: AgentRunRequestDto = {
            nodeId: n.id,
            workflowId: args.workflowId,
            systemPrompt: String(
              d.description ?? "Summarise upstream planner context for downstream AI nodes."
            ),
            inputContext,
          };
          const agentResult = await this.agents.run(agentId, dto);
          if (agentResult.status === "error") {
            nodes = patchNodesData(nodes, [n.id], {
              executionState: "error",
              _result: agentResult.errorMessage ?? "error",
            });
            // Still pass upstream values through on error
            sharedContext = { ...sharedContext, ...upstreamFlat };
          } else {
            sharedContext = {
              ...sharedContext,
              ...upstreamFlat,
              _connector_summary: agentResult.result,
              _connector_label: (d.label as string) ?? "Connector",
              ...(agentResult.data ?? {}),
            };
            nodes = patchNodesData(nodes, [n.id], {
              executionState: "done",
              _result: agentResult.result,
            });
          }
        } else {
          sharedContext = {
            ...sharedContext,
            _connector_label: (d.label as string) ?? "Connector",
            ...upstreamFlat,
          };
          const label =
            (d.sectionName as string) || (d.label as string) || "next section";
          nodes = patchNodesData(nodes, [n.id], {
            executionState: "done",
            _result: `→ ${label}`,
          });
        }
        doneIds.push(n.id);
      }
    }

    this.store.saveCanvas(args.workflowId, { nodes, edges });
    this.store.touchWorkflow(found.projectId, args.workflowId);

    return {
      ok: true,
      workflowId: args.workflowId,
      batches: batches.length,
      nodeIds: doneIds,
      canvas: { nodes, edges },
    };
  }

  /**
   * Returns an MCP App HTML page that embeds the full React Flow canvas editor
   * in an iframe. Renders the same rich editor as the dashboard.
   * bffOrigin — only used for the /canvas/:id fallback route
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getCanvasAppHtml(_bffOrigin = "http://localhost:3000"): string {
    const uiOrigin = (process.env.UI_PUBLIC_URL ?? "").replace(/\/$/, "") || "http://localhost:5173";
    const bffOrigin = (process.env.BFF_PUBLIC_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";
    // Embed the latest workflowId directly — avoids any async fetch from the iframe
    // (which would be blocked as mixed content when Assist is HTTPS but BFF is HTTP).
    const latest = this.store.getLatestWorkflow();
    const preloadWorkflowId = latest?.workflowId ?? "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workflow Canvas</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f172a;font-family:system-ui,sans-serif;overflow:hidden}
  #loading{display:flex;align-items:center;justify-content:center;height:100vh;
    color:#94a3b8;font-size:14px;gap:8px}
  #canvas-frame{width:100vw;height:100vh;border:none;display:none}
</style>
</head>
<body>
<div id="loading">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
  </svg>
  Loading canvas…
</div>
<iframe id="canvas-frame" allow="clipboard-write" title="Workflow Canvas"></iframe>

<script>
const UI = '${uiOrigin}';
const PROJECT_ID = 'p1';
const PRELOAD_ID = '${preloadWorkflowId}';
let loaded = false;

function loadWorkflow(workflowId) {
  if (loaded || !workflowId) return;
  loaded = true;
  const frame = document.getElementById('canvas-frame');
  frame.src = UI + '/projects/' + PROJECT_ID + '/workflows/' + encodeURIComponent(workflowId) + '?embed=1';
  frame.style.display = 'block';
  document.getElementById('loading').style.display = 'none';
}

// Primary: Assist sends ui/initialize with the tool result containing workflowId
window.addEventListener('message', function(event) {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.method === 'ui/initialize') {
    const content = msg.params?.result?.content?.[0]?.text;
    if (content) {
      try {
        const p = JSON.parse(content);
        const wfId = p.workflowId || p.canvas?.workflowId;
        if (wfId) { loadWorkflow(wfId); return; }
      } catch {}
    }
    const src = event.source;
    if (src) src.postMessage({ jsonrpc: '2.0', method: 'ui/ready', params: {} }, '*');
  }
});

// Fallback: BFF embeds the latest workflowId at HTML-serve-time (no fetch needed).
// This fires immediately if Assist has not yet implemented ui/initialize.
if (PRELOAD_ID) {
  setTimeout(function() { loadWorkflow(PRELOAD_ID); }, 1500);
}

window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/ready', params: {} }, '*');
</script>
</body>
</html>`;
  }

  toolGetCanvas(args: { workflowId: string }) {
    const found = this.store.findWorkflowById(args.workflowId);
    if (!found) throw new NotFoundException(`workflow ${args.workflowId} not found`);
    const canvas = this.store.getCanvas(args.workflowId);
    return {
      workflowId: args.workflowId,
      nodes: (canvas.nodes as WfNode[]).map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          label: n.data?.label,
          value: n.data?.value,
          formula: n.data?.formula,
          description: n.data?.description,
          chartType: n.data?.chartType,
          chartKeys: n.data?.chartKeys,
        },
      })),
      edges: canvas.edges,
    };
  }

  toolUpdateNode(args: { workflowId: string; nodeId: string; data: Record<string, unknown> }) {
    const found = this.store.findWorkflowById(args.workflowId);
    if (!found) throw new NotFoundException(`workflow ${args.workflowId} not found`);
    const canvas = this.store.getCanvas(args.workflowId);
    const nodes = canvas.nodes as WfNode[];
    const node = nodes.find((n) => n.id === args.nodeId);
    if (!node) throw new NotFoundException(`node ${args.nodeId} not found in workflow ${args.workflowId}`);
    node.data = { ...(node.data ?? {}), ...args.data };
    delete node.data.executionState;
    delete node.data._result;
    delete node.data._resultRaw;
    delete node.data._toolCalls;
    delete node.data._script;
    this.store.saveCanvas(args.workflowId, { nodes, edges: canvas.edges as WfEdge[] });
    this.store.touchWorkflow(found.projectId, args.workflowId);
    return { ok: true, nodeId: args.nodeId, updatedData: node.data };
  }

  private optionalToolString(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") {
      const t = v.trim();
      return t.length > 0 ? t : null;
    }
    return null;
  }

  async toolBuildWorkflow(args: Record<string, unknown>) {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      throw new BadRequestException("build_workflow requires a non-empty prompt string");
    }
    return this.demoRun.run({
      prompt,
      threadId: this.optionalToolString(args.threadId),
      runId: this.optionalToolString(args.runId),
      workflowId: this.optionalToolString(args.workflowId),
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "build_workflow":
        return await this.toolBuildWorkflow(args);
      case "create_workflow":
        return this.toolCreateWorkflow(
          args as { projectId: string; name: string; description?: string }
        );
      case "add_node":
        return this.toolAddNode(args as { workflowId: string; node: Record<string, unknown> });
      case "connect_nodes":
        return this.toolConnectNodes(
          args as {
            workflowId: string;
            source: string;
            target: string;
            id?: string;
            sourceHandle?: string;
            targetHandle?: string;
          }
        );
      case "execute_workflow":
        return await this.toolExecuteWorkflow(args as { workflowId: string });
      case "get_canvas":
        return this.toolGetCanvas(args as { workflowId: string });
      case "update_node":
        return this.toolUpdateNode(args as { workflowId: string; nodeId: string; data: Record<string, unknown> });
      default:
        throw new BadRequestException(`Unknown tool: ${name}`);
    }
  }
}
