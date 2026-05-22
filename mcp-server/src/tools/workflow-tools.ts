// Workflow and node execution tools — ported from server/src/planner/planner.service.ts

import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './index.js';
import { store } from '../store/store.js';
import {
  assembleInputContext,
  patchNodesData,
  routeAgentOutputs,
  topologicalBatches,
  type WfEdge,
  type WfNode,
  contextKeyForNode,
  valueForContextFromNode,
} from '../graph/workflow-graph.js';
import { runAgent, type AgentRunRequestDto } from '../agents/agent-runner.js';
import { config } from '../config.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function coerceContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === 'number') out[k] = v;
    else if (typeof v === 'string') { const n2 = parseFloat(v.replace(/[$,€£%\s]/g, '')); out[k] = Number.isNaN(n2) ? v : n2; }
    else out[k] = v;
  }
  return out;
}

function stripExecutionState(nodes: WfNode[]): WfNode[] {
  return nodes.map(n => {
    const d = { ...(n.data ?? {}) };
    delete d.executionState; delete d._result; delete d._resultRaw; delete d._toolCalls; delete d._script; delete d.status;
    return { ...n, data: d };
  });
}

function normalizeIncomingNode(raw: Record<string, unknown>): WfNode {
  const id = typeof raw['id'] === 'string' && (raw['id'] as string).trim() ? (raw['id'] as string).trim() : `n-${randomUUID().slice(0, 8)}`;
  const type = typeof raw['type'] === 'string' ? raw['type'] as string : 'default';
  const pos = raw['position'] as { x?: number; y?: number } | undefined;
  const position = { x: typeof pos?.x === 'number' ? pos.x : 0, y: typeof pos?.y === 'number' ? pos.y : 0 };
  const data = raw['data'] && typeof raw['data'] === 'object' && !Array.isArray(raw['data'])
    ? (raw['data'] as Record<string, unknown>) : {};
  return { id, type, position, data };
}

// Script runner (inline)
function executeScript(formula: string, ctx: Record<string, unknown>): { result?: unknown; error?: string } {
  try {
    const keys = Object.keys(ctx);
    const vals = keys.map(k => ctx[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `return (${formula})`);
    return { result: fn(...vals) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Canvas App HTML (MCP App iframe) ─────────────────────────────────────

export const WORKFLOW_CANVAS_RESOURCE_URI = 'ui://workflow-canvas';

export function getCanvasAppHtml(): string {
  const uiOrigin = config.ui.publicUrl;
  const latest = store.getLatestWorkflow();
  const preloadId = latest?.workflowId ?? '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workflow Canvas</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;font-family:system-ui,sans-serif;overflow:hidden}
#loading{display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;font-size:14px;gap:8px}
#canvas-frame{width:100vw;height:100vh;border:none;display:none}</style></head>
<body>
<div id="loading"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>Loading canvas…</div>
<iframe id="canvas-frame" allow="clipboard-write" title="Workflow Canvas"></iframe>
<script>
const UI='${uiOrigin}';const PROJECT_ID='p1';const PRELOAD_ID='${preloadId}';let loaded=false;
function loadWorkflow(id){if(loaded||!id)return;loaded=true;
const f=document.getElementById('canvas-frame');
f.src=UI+'/projects/'+PROJECT_ID+'/workflows/'+encodeURIComponent(id)+'?embed=1';
f.style.display='block';document.getElementById('loading').style.display='none';}
window.addEventListener('message',function(e){const m=e.data;if(!m||typeof m!=='object')return;
if(m.method==='ui/initialize'){const c=m.params?.result?.content?.[0]?.text;
if(c){try{const p=JSON.parse(c);const id=p.workflowId||p.canvas?.workflowId;if(id){loadWorkflow(id);return;}}catch{}}
const s=e.source;if(s)s.postMessage({jsonrpc:'2.0',method:'ui/ready',params:{}},'*');}});
if(PRELOAD_ID){setTimeout(function(){loadWorkflow(PRELOAD_ID);},1500);}
window.parent.postMessage({jsonrpc:'2.0',method:'ui/ready',params:{}},'*');
</script></body></html>`;
}

// ── Tool: create_workflow ─────────────────────────────────────────────────

const createWorkflowSchema = z.object({
  projectId: z.string().describe("Project id (e.g. p1)"),
  name: z.string(),
  description: z.string().optional(),
});

// ── Tool: add_node ────────────────────────────────────────────────────────

const addNodeSchema = z.object({
  workflowId: z.string(),
  node: z.record(z.string(), z.unknown()),
});

// ── Tool: connect_nodes ───────────────────────────────────────────────────

const connectNodesSchema = z.object({
  workflowId: z.string(),
  source: z.string(),
  target: z.string(),
  id: z.string().optional().describe("Optional edge id"),
});

// ── Tool: execute_workflow ────────────────────────────────────────────────

const executeWorkflowSchema = z.object({ workflowId: z.string() });

// ── Tool: get_canvas ─────────────────────────────────────────────────────

const getCanvasSchema = z.object({ workflowId: z.string() });

// ── Tool: update_node ─────────────────────────────────────────────────────

const updateNodeSchema = z.object({
  workflowId: z.string(),
  nodeId: z.string().describe("The node id to update"),
  data: z.record(z.string(), z.unknown()).describe("Fields to merge into node.data"),
});

// ── Handlers ──────────────────────────────────────────────────────────────

async function handleCreateWorkflow(args: unknown): Promise<CallToolResult> {
  const { projectId, name, description } = createWorkflowSchema.parse(args);
  const wf = store.addWorkflow(projectId, { name, description });
  if (!wf) return { content: [{ type: 'text', text: JSON.stringify({ error: `project ${projectId} not found` }) }], isError: true };
  store.saveCanvas(wf.id, { nodes: [], edges: [] });
  return { content: [{ type: 'text', text: JSON.stringify({ workflowId: wf.id, name: wf.name, projectId }) }] };
}

async function handleAddNode(args: unknown): Promise<CallToolResult> {
  const { workflowId, node } = addNodeSchema.parse(args);
  const found = store.findWorkflowById(workflowId);
  if (!found) return { content: [{ type: 'text', text: JSON.stringify({ error: `workflow ${workflowId} not found` }) }], isError: true };
  const canvas = store.getCanvas(workflowId);
  const nodes = [...(canvas.nodes as WfNode[])];
  const next = normalizeIncomingNode(node);
  if (nodes.some(n => n.id === next.id)) return { content: [{ type: 'text', text: JSON.stringify({ error: `node id already exists: ${next.id}` }) }], isError: true };
  nodes.push(next);
  store.saveCanvas(workflowId, { nodes, edges: canvas.edges as WfEdge[] });
  store.touchWorkflow(found.projectId, workflowId);
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, nodeId: next.id, nodeCount: nodes.length }) }] };
}

async function handleConnectNodes(args: unknown): Promise<CallToolResult> {
  const { workflowId, source, target, id } = connectNodesSchema.parse(args);
  const found = store.findWorkflowById(workflowId);
  if (!found) return { content: [{ type: 'text', text: JSON.stringify({ error: `workflow ${workflowId} not found` }) }], isError: true };
  const canvas = store.getCanvas(workflowId);
  const nodes = canvas.nodes as WfNode[];
  if (!nodes.some(n => n.id === source)) return { content: [{ type: 'text', text: JSON.stringify({ error: `unknown source ${source}` }) }], isError: true };
  if (!nodes.some(n => n.id === target)) return { content: [{ type: 'text', text: JSON.stringify({ error: `unknown target ${target}` }) }], isError: true };
  const edges = [...(canvas.edges as WfEdge[])];
  const edgeId = id?.trim() || `e-${source}-${target}-${randomUUID().slice(0, 6)}`;
  if (edges.some(e => e.id === edgeId)) return { content: [{ type: 'text', text: JSON.stringify({ error: `edge id already exists: ${edgeId}` }) }], isError: true };
  edges.push({ id: edgeId, source, target, sourceHandle: null, targetHandle: null });
  store.saveCanvas(workflowId, { nodes, edges });
  store.touchWorkflow(found.projectId, workflowId);
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, edgeId, edgeCount: edges.length }) }] };
}

async function handleExecuteWorkflow(args: unknown): Promise<CallToolResult> {
  const { workflowId } = executeWorkflowSchema.parse(args);
  const found = store.findWorkflowById(workflowId);
  if (!found) return { content: [{ type: 'text', text: JSON.stringify({ error: `workflow ${workflowId} not found` }) }], isError: true };

  const canvas = store.getCanvas(workflowId);
  let nodes = JSON.parse(JSON.stringify(canvas.nodes)) as WfNode[];
  const edges = JSON.parse(JSON.stringify(canvas.edges)) as WfEdge[];

  nodes = stripExecutionState(nodes);
  let sharedContext: Record<string, unknown> = {};
  const batches = topologicalBatches(nodes, edges);
  const doneIds: string[] = [];

  for (const batch of batches) {
    const aiTypes = new Set(['ai', 'connector']);
    const nonAi = batch.filter(n => !aiTypes.has(n.type ?? ''));
    const aiNodes = batch.filter(n => n.type === 'ai');
    const connectorNodes = batch.filter(n => n.type === 'connector' && edges.some(e => e.target === n.id));

    for (const n of nonAi) {
      if (n.type === 'calculator') {
        const d = (nodes.find(x => x.id === n.id) ?? n).data ?? {};
        const formula = String(d['formula'] ?? '').trim();
        const ctx = assembleInputContext(n.id, nodes, edges);
        const coerced = coerceContext(ctx);
        let rawValue: unknown, displayValue = '';
        if (formula) {
          const { result, error } = executeScript(formula, coerced);
          if (!error) {
            rawValue = result;
            const numVal = typeof result === 'number' ? result : null;
            displayValue = numVal !== null ? numVal.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(result);
          }
        }
        nodes = patchNodesData(nodes, [n.id], { executionState: 'done', _result: displayValue, _resultRaw: rawValue });
        doneIds.push(n.id);
      } else {
        const cur = nodes.find(x => x.id === n.id) ?? n;
        const d = cur.data ?? {};
        let result: unknown = cur.type === 'input' ? (d['value'] ?? d['executionResult']) : d['executionResult'];
        if ((result == null || result === '') && cur.type === 'output') {
          const upstreamCtx = assembleInputContext(n.id, nodes, edges);
          const vals = Object.values(upstreamCtx).filter(v => v != null && v !== '');
          if (vals.length > 0) result = vals[vals.length - 1];
        }
        nodes = patchNodesData(nodes, [n.id], { executionState: 'done', ...(result != null ? { _result: result } : {}) });
        if (result != null) doneIds.push(n.id);
        else if (cur.type === 'trigger' || cur.type === 'output') doneIds.push(n.id);
      }
    }

    for (const n of aiNodes) {
      const cur = nodes.find(x => x.id === n.id) ?? n;
      const d = cur.data ?? {};
      const systemPrompt = String(d['description'] ?? '');
      const inputContext = assembleInputContext(n.id, nodes, edges, sharedContext);
      const agentId = String(d['agentId'] ?? '').trim() || config.agent.demoPlannerId;
      const dto: AgentRunRequestDto = { nodeId: n.id, workflowId, systemPrompt, inputContext };
      const run = await runAgent(agentId, dto);
      if (run.status === 'error') {
        nodes = patchNodesData(nodes, [n.id], { executionState: 'error', _result: run.errorMessage ?? 'Agent error' });
      } else {
        const aiText = run.result?.trim() || (run.toolCalls?.length
          ? (() => { const last = run.toolCalls[run.toolCalls.length - 1]; return `${last.script ?? 'result'} = ${String(last.result)}`; })()
          : '');
        nodes = patchNodesData(nodes, [n.id], { executionState: 'done', _result: aiText, ...(run.toolCalls?.length ? { _toolCalls: run.toolCalls } : {}), ...(run.script ? { _script: run.script } : {}) });
        nodes = routeAgentOutputs(n.id, run, nodes, edges);
      }
      doneIds.push(n.id);
    }

    for (const n of connectorNodes) {
      const inputContext = assembleInputContext(n.id, nodes, edges);
      sharedContext = { ...sharedContext, ...inputContext };
      nodes = patchNodesData(nodes, [n.id], { executionState: 'done' });
      doneIds.push(n.id);
    }
  }

  store.saveCanvas(workflowId, { nodes, edges });
  store.touchWorkflow(found.projectId, workflowId);
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, workflowId, batches: batches.length, nodeIds: doneIds, canvas: { nodes, edges } }) }] };
}

async function handleGetCanvas(args: unknown): Promise<CallToolResult> {
  const { workflowId } = getCanvasSchema.parse(args);
  const found = store.findWorkflowById(workflowId);
  if (!found) return { content: [{ type: 'text', text: JSON.stringify({ error: `workflow ${workflowId} not found` }) }], isError: true };
  const canvas = store.getCanvas(workflowId);
  const summary = {
    workflowId,
    nodes: (canvas.nodes as WfNode[]).map(n => ({
      id: n.id, type: n.type, position: n.position,
      data: { label: n.data?.['label'], value: n.data?.['value'], formula: n.data?.['formula'], description: n.data?.['description'] },
    })),
    edges: canvas.edges,
  };
  return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
}

async function handleUpdateNode(args: unknown): Promise<CallToolResult> {
  const { workflowId, nodeId, data } = updateNodeSchema.parse(args);
  const found = store.findWorkflowById(workflowId);
  if (!found) return { content: [{ type: 'text', text: JSON.stringify({ error: `workflow ${workflowId} not found` }) }], isError: true };
  const canvas = store.getCanvas(workflowId);
  const nodes = canvas.nodes as WfNode[];
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return { content: [{ type: 'text', text: JSON.stringify({ error: `node ${nodeId} not found` }) }], isError: true };
  node.data = { ...(node.data ?? {}), ...data };
  delete node.data['executionState']; delete node.data['_result']; delete node.data['_resultRaw'];
  store.saveCanvas(workflowId, { nodes, edges: canvas.edges as WfEdge[] });
  store.touchWorkflow(found.projectId, workflowId);
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, nodeId, updatedData: node.data }) }] };
}

// ── Export tool definitions ────────────────────────────────────────────────

export function createWorkflowTools(): Record<string, ToolDefinition> {
  return {
    create_workflow: {
      description: 'Create a new empty workflow under a project. Returns workflow id.',
      inputSchema: createWorkflowSchema,
      handler: handleCreateWorkflow,
    },
    execute_workflow: {
      description: 'Run the workflow server-side: topological order, calculator paths, Trimble agents for AI nodes. Persists results.',
      inputSchema: executeWorkflowSchema,
      handler: handleExecuteWorkflow,
      _meta: { ui: { resourceUri: WORKFLOW_CANVAS_RESOURCE_URI } },
    },
    get_canvas: {
      description: 'Return current nodes and edges for an existing workflow. Call before update_node to see node ids and values.',
      inputSchema: getCanvasSchema,
      handler: handleGetCanvas,
    },
  };
}

export function createNodeTools(): Record<string, ToolDefinition> {
  return {
    add_node: {
      description: 'Append a node to a workflow canvas (id, type, position, data).',
      inputSchema: addNodeSchema,
      handler: handleAddNode,
    },
    connect_nodes: {
      description: 'Add a directed edge between two node ids on a workflow canvas.',
      inputSchema: connectNodesSchema,
      handler: handleConnectNodes,
    },
    update_node: {
      description: 'Patch data fields on an existing node (e.g. change value or formula). Call execute_workflow after to re-run.',
      inputSchema: updateNodeSchema,
      handler: handleUpdateNode,
    },
  };
}
