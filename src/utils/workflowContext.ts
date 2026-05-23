import type { Edge, Node } from "@xyflow/react";
import type { AgentRunResult } from "@/types/agent";

/** Context key for an upstream node when building `inputContext` for an AI node. */
export function contextKeyForNode(n: Node): string {
  const d = n.data as Record<string, unknown>;
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

/** Value to send for that node after upstream execution has set `_result` / `value`. */
export function valueForContextFromNode(n: Node): unknown {
  const d = n.data as Record<string, unknown>;
  if (n.type === "database") {
    const entries = (d.entries as { key: string; value: string }[]) ?? [];
    return Object.fromEntries(entries.map((e) => [e.key, e.value]));
  }
  if (n.type === "assumption") {
    // Prefer the raw mostLikely number over the formatted _result string
    return d._result ?? d.mostLikely ?? d.executionResult;
  }
  if (n.type === "calculator") {
    // Return the raw numeric result if available, fall back to formatted string
    const raw = d._resultRaw ?? d._result ?? d.executionResult;
    return raw;
  }
  if (n.type === "input") return d._result ?? d.value ?? d.executionResult;
  // For ai/output/other nodes, treat empty string as missing
  const r = d._result ?? d.value ?? d.executionResult;
  return (r === "" || r == null) ? null : r;
}

/** Collect upstream context for an AI (or any) node from incoming edges.
 *  Optionally merges in sharedContext (from Connector nodes) as additional background. */
export function assembleInputContext(
  targetId: string,
  nodes: Node[],
  edges: Edge[],
  sharedContext?: Record<string, unknown>
): Record<string, unknown> {
  // Start with shared context (connector enrichment) as low-priority background
  const inputContext: Record<string, unknown> = { ...(sharedContext ?? {}) };

  for (const e of edges) {
    if (e.target !== targetId) continue;
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;

    if (src.type === "database") {
      const entries = ((src.data as Record<string, unknown>).entries as { key: string; value: string }[]) ?? [];
      for (const entry of entries) {
        if (entry.key) inputContext[entry.key] = entry.value;
      }
    } else {
      const key = contextKeyForNode(src);
      // Direct upstream edges override shared context
      inputContext[key] = valueForContextFromNode(src);
    }
  }
  return inputContext;
}

/**
 * Resolve what an output node should display from its direct upstream neighbors.
 * Run this after AI nodes in the same topological batch have finished.
 */
export function resolveOutputValue(
  outputId: string,
  nodes: Node[],
  edges: Edge[]
): string | null {
  const incoming = edges.filter((e) => e.target === outputId);
  if (incoming.length === 0) return null;

  for (const e of incoming) {
    const src = nodes.find((n) => n.id === e.source);
    if (!src || src.type !== "ai") continue;
    const v = valueForContextFromNode(src);
    if (v != null && v !== "") return String(v);
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

type PatchFn = (ids: string[], patch: Record<string, unknown>) => void;

/**
 * Push structured `data` from an AI result onto downstream nodes when
 * `target.data.description` matches a key in `data`.
 */
export function routeAgentOutputs(
  aiNodeId: string,
  agentResult: AgentRunResult,
  nodes: Node[],
  edges: Edge[],
  patchNodes: PatchFn
): void {
  const payload = agentResult.data;
  if (!payload) return;

  for (const e of edges) {
    if (e.source !== aiNodeId) continue;
    const target = nodes.find((n) => n.id === e.target);
    if (!target) continue;
    const d = target.data as Record<string, unknown>;
    const key = (d.description as string)?.trim();
    if (!key || !(key in payload)) continue;
    const v = payload[key];
    const str =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
    patchNodes([target.id], { _result: str, value: str });
  }
}
