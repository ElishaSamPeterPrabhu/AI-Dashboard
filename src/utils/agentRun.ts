import type { AgentRunRequest, AgentRunResult } from "@/types/agent";
import { useAppStore } from "@/store/appStore";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Coerce a context value to a number for script execution.
 * Strips currency symbols, commas, percent signs, etc.
 */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,€£%\s]/g, "").replace(/\((\d+)%\)/, "$1");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Demo / offline: simulate what a real agent run would produce.
 * Uses the inputContext to build a meaningful result and a verifiable formula.
 */
export async function simulateAgentRun(
  systemPrompt: string,
  inputContext: Record<string, unknown>,
  staticFallback?: string
): Promise<AgentRunResult> {
  await sleep(150);

  // Extract numeric context entries — these are what the agent would use in calculations
  const numericEntries = Object.entries(inputContext)
    .map(([k, v]) => ({ key: k, raw: v, num: toNumber(v) }))
    .filter((e) => e.num !== null) as Array<{ key: string; raw: unknown; num: number }>;

  // Build a formula only from numeric keys
  const formulaKeys = numericEntries.map((e) => e.key);
  const formula =
    formulaKeys.length >= 2
      ? formulaKeys.slice(0, 3).join(" * ")
      : formulaKeys[0] ?? null;

  let scriptResult: number | string = "—";
  if (formula && numericEntries.length > 0) {
    try {
      const args = numericEntries.map((e) => e.key);
      const vals = numericEntries.map((e) => e.num);
      // eslint-disable-next-line no-new-func
      const fn = new Function(...args, `return (${formula})`);
      scriptResult = fn(...vals) as number;
    } catch {
      scriptResult = "eval error";
    }
  }

  // Build a human-readable summary that reflects actual context values
  const contextSummary = Object.entries(inputContext)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const result =
    staticFallback?.trim() ||
    `Mock: ${systemPrompt.slice(0, 60)}${systemPrompt.length > 60 ? "…" : ""} | ${contextSummary}`;

  const toolCalls = formula
    ? [
        {
          id: `mock-${Date.now()}`,
          script: formula,
          description: `Auto-synthesised formula from numeric context keys: ${formulaKeys.join(", ")}`,
          result: scriptResult,
        },
      ]
    : [];

  return {
    status: "done",
    result,
    data: { ...inputContext, _mock: true },
    ...(formula ? { script: formula } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
  };
}

function apiBase(): string {
  const v = import.meta.env.VITE_API_BASE as string | undefined;
  return (v && v.replace(/\/$/, "")) || "";
}

/**
 * Live call through BFF → Trimble Agent Service (via AG-UI SSE).
 * The BFF collapses the upstream SSE stream into a single AgentRunResult JSON.
 */
export async function liveAgentRun(
  agentId: string,
  body: AgentRunRequest
): Promise<AgentRunResult> {
  const base = apiBase();
  const path = `${base}/api/agents/${encodeURIComponent(agentId)}/runs`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const res = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include",
    });
    const text = await res.text();
    if (!res.ok) {
      let errorMessage = text || `${res.status} ${res.statusText}`;
      try {
        const parsed = JSON.parse(text) as { errorMessage?: string; error?: string };
        errorMessage = parsed.errorMessage ?? parsed.error ?? errorMessage;
      } catch {
        /* keep raw text */
      }
      return {
        status: "error",
        result: "",
        errorMessage,
      };
    }
    try {
      return JSON.parse(text) as AgentRunResult;
    } catch {
      return {
        status: "error",
        result: "",
        errorMessage: "Invalid JSON from agent run",
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "error", result: "", errorMessage: msg };
  }
}

/**
 * Live Trimble runs go to POST /api/agents/:id/runs (BFF uses server/.env token — never exposed to Vite).
 * - `VITE_LIVE_AGENTS=false` → always mock.
 * - `VITE_LIVE_AGENTS=true` → always try live when `agentId` is set.
 * - unset / other → use live if GET /api/health reported `agentKeySet` (refreshed with projects bootstrap).
 */
export function useLiveAgents(): boolean {
  const flag = import.meta.env.VITE_LIVE_AGENTS;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return useAppStore.getState().bffAgentConfigured === true;
}
