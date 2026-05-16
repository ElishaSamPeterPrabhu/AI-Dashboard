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
        _meta: {
          ui: {
            resourceUri: "ui://workflow-canvas",
          },
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

  /**
   * Returns a self-contained HTML MCP App that renders the workflow canvas inline
   * in Claude Desktop, VS Code Copilot, or Trimble Assist.
   */
  getCanvasAppHtml(bffOrigin = "http://localhost:3000"): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workflow Canvas</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0;overflow:auto}
  #loading,#error{display:flex;align-items:center;justify-content:center;height:100vh;
    font-size:14px;color:#94a3b8;gap:8px}
  #error{color:#f87171}
  #canvas-wrap{padding:16px;min-height:100vh}
  .tooltip{position:fixed;background:#1e293b;border:1px solid #334155;border-radius:6px;
    padding:8px 12px;font-size:12px;line-height:1.6;pointer-events:none;display:none;
    max-width:220px;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.4)}
  .node{cursor:pointer}
  .node:hover rect{filter:brightness(1.25)}
</style>
</head>
<body>
<div id="loading">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
  </svg>
  Loading workflow canvas…
</div>
<div id="error" style="display:none"></div>
<div id="canvas-wrap" style="display:none">
  <div id="canvas-meta" style="font-size:12px;color:#64748b;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #1e293b"></div>
  <svg id="canvas"></svg>
</div>
<div class="tooltip" id="tooltip"></div>

<script>
const BFF = '${bffOrigin}';
const COLORS = {
  trigger:    {fill:'#1e293b',stroke:'#64748b',text:'#94a3b8'},
  input:      {fill:'#0f2044',stroke:'#3b82f6',text:'#93c5fd'},
  database:   {fill:'#0a2030',stroke:'#0ea5e9',text:'#7dd3fc'},
  calculator: {fill:'#2a1c08',stroke:'#f59e0b',text:'#fcd34d'},
  ai:         {fill:'#1e0f36',stroke:'#a855f7',text:'#d8b4fe'},
  chart:      {fill:'#0a2424',stroke:'#14b8a6',text:'#5eead4'},
  connector:  {fill:'#1e293b',stroke:'#475569',text:'#94a3b8'},
  output:     {fill:'#0a2016',stroke:'#22c55e',text:'#86efac'},
  decision:   {fill:'#2a0f14',stroke:'#ef4444',text:'#fca5a5'},
  assumption: {fill:'#1c0f2c',stroke:'#8b5cf6',text:'#c4b5fd'},
};
const W=160,H=52,PAD=24;

function show(el){document.getElementById(el).style.display='';}
function hide(el){document.getElementById(el).style.display='none';}

async function loadCanvas(workflowId){
  try{
    const r=await fetch(BFF+'/api/workflows/'+encodeURIComponent(workflowId)+'/canvas');
    if(!r.ok) throw new Error('HTTP '+r.status);
    const {nodes=[],edges=[]}=await r.json();
    renderGraph(workflowId,nodes,edges);
  }catch(e){
    hide('loading');
    show('error');
    document.getElementById('error').textContent='Failed to load canvas: '+e.message;
  }
}

function renderGraph(wfId,nodes,edges){
  hide('loading');
  show('canvas-wrap');
  document.getElementById('canvas-meta').textContent=
    'Workflow: '+wfId+' · '+nodes.length+' nodes · '+edges.length+' edges';

  const posMap={};
  for(const n of nodes){
    posMap[n.id]={x:(n.position?.x??0)+PAD,y:(n.position?.y??0)+PAD};
  }

  const xs=Object.values(posMap).map(p=>p.x);
  const ys=Object.values(posMap).map(p=>p.y);
  const svgW=Math.max(...xs)+W+PAD*2;
  const svgH=Math.max(...ys)+H+PAD*2;

  const svg=document.getElementById('canvas');
  svg.setAttribute('viewBox','0 0 '+svgW+' '+svgH);
  svg.setAttribute('width',svgW);
  svg.setAttribute('height',svgH);
  svg.innerHTML='<defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto"><path d="M0,0 L0,5 L7,2.5 z" fill="#475569"/></marker></defs>';

  // Edges
  for(const e of edges){
    const s=posMap[e.source],t=posMap[e.target];
    if(!s||!t)continue;
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',s.x+W/2); line.setAttribute('y1',s.y+H/2);
    line.setAttribute('x2',t.x+W/2); line.setAttribute('y2',t.y+H/2);
    line.setAttribute('stroke','#334155'); line.setAttribute('stroke-width','1.5');
    line.setAttribute('marker-end','url(#arr)');
    svg.appendChild(line);
  }

  const tip=document.getElementById('tooltip');

  // Nodes
  for(const n of nodes){
    const pos=posMap[n.id];if(!pos)continue;
    const c=COLORS[n.type]??COLORS.output;
    const label=String(n.data?.label??n.id);
    const result=n.data?._result!=null?String(n.data._result):null;

    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','node');
    g.setAttribute('transform','translate('+pos.x+','+pos.y+')');

    const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('width',W); rect.setAttribute('height',H);
    rect.setAttribute('rx','6');
    rect.setAttribute('fill',c.fill); rect.setAttribute('stroke',c.stroke);
    rect.setAttribute('stroke-width','1.5');

    const tType=document.createElementNS('http://www.w3.org/2000/svg','text');
    tType.setAttribute('x',W/2); tType.setAttribute('y','14');
    tType.setAttribute('text-anchor','middle');
    tType.setAttribute('font-size','9'); tType.setAttribute('letter-spacing','0.5');
    tType.setAttribute('fill',c.stroke);
    tType.textContent=(n.type??'').toUpperCase();

    const tLabel=document.createElementNS('http://www.w3.org/2000/svg','text');
    tLabel.setAttribute('x',W/2); tLabel.setAttribute('y','28');
    tLabel.setAttribute('text-anchor','middle');
    tLabel.setAttribute('font-size','11'); tLabel.setAttribute('font-weight','600');
    tLabel.setAttribute('fill',c.text);
    tLabel.textContent=label.length>20?label.slice(0,19)+'…':label;

    g.appendChild(rect); g.appendChild(tType); g.appendChild(tLabel);

    if(result){
      const tRes=document.createElementNS('http://www.w3.org/2000/svg','text');
      tRes.setAttribute('x',W/2); tRes.setAttribute('y','43');
      tRes.setAttribute('text-anchor','middle');
      tRes.setAttribute('font-size','10'); tRes.setAttribute('fill','#64748b');
      tRes.textContent=result.length>18?result.slice(0,17)+'…':result;
      g.appendChild(tRes);
    }

    const tipLines=[
      'Type: '+( n.type??''),
      'Key: '+(n.data?.plannerKey??n.id),
      result?'Result: '+result:null,
      n.data?.formula?'Formula: '+n.data.formula:null,
      n.data?.value!=null?'Value: '+n.data.value:null,
    ].filter(Boolean);

    g.addEventListener('mouseenter',function(ev){
      tip.style.display='block';
      tip.style.left=(ev.clientX+14)+'px';
      tip.style.top=(ev.clientY-8)+'px';
      tip.innerHTML=tipLines.map(l=>'<div>'+l+'</div>').join('');
    });
    g.addEventListener('mousemove',function(ev){
      tip.style.left=(ev.clientX+14)+'px';
      tip.style.top=(ev.clientY-8)+'px';
    });
    g.addEventListener('mouseleave',function(){tip.style.display='none';});
    svg.appendChild(g);
  }
}

// MCP Apps postMessage protocol
window.addEventListener('message',function(event){
  const msg=event.data;
  if(!msg||typeof msg!=='object')return;
  if(msg.method==='ui/initialize'){
    const content=msg.params?.result?.content?.[0]?.text;
    if(content){
      try{
        const p=JSON.parse(content);
        if(p.workflowId) loadCanvas(p.workflowId);
        // Also check canvas.workflowId from execute_workflow result
        else if(p.canvas?.workflowId) loadCanvas(p.canvas.workflowId);
      }catch{}
    }
    // ACK
    const src=event.source;
    if(src) src.postMessage({jsonrpc:'2.0',method:'ui/ready',params:{}},'*');
  }
});

// Signal ready immediately — host may send ui/initialize after this
window.parent.postMessage({jsonrpc:'2.0',method:'ui/ready',params:{}},'*');
</script>
</body>
</html>`;
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
