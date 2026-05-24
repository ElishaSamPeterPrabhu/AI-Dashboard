/**
 * Minimal React-Flow-shaped graph helpers for server-side planner execution.
 * Kept in sync with `src/store/canvasStore.ts` / `src/utils/workflowContext.ts`.
 */

export type WfNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  width?: number;
  height?: number;
  parentId?: string;
  extent?: string;
  style?: Record<string, unknown>;
};

export type WfEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

const SKIP_TYPES = new Set(["group", "loop"]);

export function topologicalBatches(nodes: WfNode[], edges: WfEdge[]): WfNode[][] {
  const execNodes = nodes.filter((n) => !SKIP_TYPES.has(n.type ?? ""));
  const nodeMap = new Map(execNodes.map((n) => [n.id, n]));

  const inDegree = new Map<string, number>(execNodes.map((n) => [n.id, 0]));
  const outEdges = new Map<string, string[]>();

  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
  }

  // Only execute nodes reachable from a trigger node; nothing runs without a trigger
  const triggerIds = execNodes.filter((n) => n.type === "trigger").map((n) => n.id);
  if (triggerIds.length === 0) return [];
  const reachable = new Set<string>(triggerIds);
  const queue = [...triggerIds];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of outEdges.get(cur) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  const activeNodes = execNodes.filter((n) => reachable.has(n.id));

  const activeMap = new Map(activeNodes.map((n) => [n.id, n]));
  const activeInDegree = new Map<string, number>(activeNodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if (!activeMap.has(e.source) || !activeMap.has(e.target)) continue;
    activeInDegree.set(e.target, (activeInDegree.get(e.target) ?? 0) + 1);
  }

  const batches: WfNode[][] = [];
  const remaining = new Set(activeNodes.map((n) => n.id));

  while (remaining.size > 0) {
    const batch = [...remaining]
      .filter((id) => (activeInDegree.get(id) ?? 0) === 0)
      .map((id) => activeMap.get(id)!);

    if (batch.length === 0) {
      batch.push(...[...remaining].map((id) => activeMap.get(id)!));
      batches.push(batch);
      break;
    }

    batches.push(batch);

    for (const n of batch) {
      remaining.delete(n.id);
      for (const target of outEdges.get(n.id) ?? []) {
        activeInDegree.set(target, (activeInDegree.get(target) ?? 1) - 1);
      }
    }
  }

  return batches;
}

export function contextKeyForNode(n: WfNode): string {
  const d = n.data ?? {};
  // plannerKey is always the camelCase key the AI uses in formulas — prefer it for all node types
  const pk = (d.plannerKey as string)?.trim();
  if (pk) return pk;
  // description holds the variable name for input/assumption/database nodes
  if (n.type === "input" || n.type === "assumption" || n.type === "database") {
    const k = (d.description as string)?.trim();
    if (k && !k.includes(" ")) return k;
  }
  // node.id is always camelCase and is what formulas reference — prefer over label
  if (n.id && !n.id.includes(" ")) return n.id;
  const label = (d.label as string)?.trim() || n.id;
  return label.replace(/\s+/g, "_").toLowerCase();
}

export function valueForContextFromNode(n: WfNode): unknown {
  const d = n.data ?? {};
  if (n.type === "database") {
    const entries = (d.entries as { key: string; value: string }[]) ?? [];
    return Object.fromEntries(entries.map((e) => [e.key, e.value]));
  }
  if (n.type === "assumption") {
    return d._result ?? d.mostLikely ?? d.executionResult;
  }
  if (n.type === "calculator") {
    return d._resultRaw ?? d._result ?? d.executionResult;
  }
  if (n.type === "input") return d._result ?? d.value ?? d.executionResult;
  // For ai/output/other nodes, treat empty string as missing (agent may produce no text)
  const r = d._result ?? d.value ?? d.executionResult;
  return (r === "" || r == null) ? null : r;
}

export function assembleInputContext(
  targetId: string,
  nodes: WfNode[],
  edges: WfEdge[],
  sharedContext?: Record<string, unknown>
): Record<string, unknown> {
  const inputContext: Record<string, unknown> = { ...(sharedContext ?? {}) };

  for (const e of edges) {
    if (e.target !== targetId) continue;
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;

    if (src.type === "database") {
      const entries = ((src.data ?? {}).entries as { key: string; value: string }[]) ?? [];
      for (const entry of entries) {
        if (entry.key) inputContext[entry.key] = entry.value;
      }
    } else {
      const key = contextKeyForNode(src);
      inputContext[key] = valueForContextFromNode(src);
    }
  }
  return inputContext;
}

/** Resolve display value for an output node (call after AI nodes in the same batch). */
export function resolveOutputValue(
  outputId: string,
  nodes: WfNode[],
  edges: WfEdge[]
): string | null {
  const incoming = edges.filter((e) => e.target === outputId);
  if (incoming.length === 0) return null;

  for (const e of incoming) {
    const src = nodes.find((n) => n.id === e.source);
    if (!src || src.type !== "ai") continue;
    const v = valueForContextFromNode(src);
    if (v != null && v !== "") return String(v);
    // AI node ran but produced no text — surface its label so output isn't "Awaiting value"
    if (src.data?.executionState === "done") {
      return (src.data?.label as string) || "Agent completed.";
    }
  }

  if (incoming.length === 1) {
    const src = nodes.find((n) => n.id === incoming[0]!.source);
    if (!src) return null;
    const v = valueForContextFromNode(src);
    return v != null && v !== "" ? String(v) : null;
  }

  let best: string | null = null;
  for (const e of incoming) {
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;
    const v = valueForContextFromNode(src);
    if (v == null || v === "") continue;
    const s = String(v);
    if (best == null || s.length > best.length) best = s;
  }
  return best;
}

export type NodeDataPatch = Record<string, unknown>;

export function patchNodesData(
  nodes: WfNode[],
  ids: string[],
  patch: NodeDataPatch
): WfNode[] {
  const idSet = new Set(ids);
  return nodes.map((n) =>
    idSet.has(n.id) ? { ...n, data: { ...(n.data ?? {}), ...patch } } : n
  );
}

export function routeAgentOutputs(
  aiNodeId: string,
  agentResult: { data?: Record<string, unknown> },
  nodes: WfNode[],
  edges: WfEdge[]
): WfNode[] {
  const payload = agentResult.data;
  if (!payload) return nodes;

  let next = nodes;
  for (const e of edges) {
    if (e.source !== aiNodeId) continue;
    const target = next.find((n) => n.id === e.target);
    if (!target) continue;
    const d = target.data ?? {};
    const key = (d.description as string)?.trim();
    if (!key || !(key in payload)) continue;
    const v = payload[key];
    const str =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
    next = patchNodesData(next, [target.id], { _result: str, value: str });
  }
  return next;
}
