import {
  BadRequestException,
  ConflictException,
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
    private readonly scriptRunner: ScriptRunnerService
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
          const result =
            cur.type === "input"
              ? (d.value ?? d.executionResult)
              : d.executionResult;
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
          nodes = patchNodesData(nodes, [n.id], {
            executionState: "done",
            status: "idle",
            _result: run.result,
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

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
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
      default:
        throw new BadRequestException(`Unknown tool: ${name}`);
    }
  }
}
