/** Request body for POST /api/agents/:agentId/runs (BFF → Trimble or mock). */
export interface AgentRunRequest {
  nodeId: string;
  workflowId: string;
  systemPrompt: string;
  inputContext: Record<string, unknown>;
  outputSchema?: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
  };
}

export interface ToolCallRecord {
  id: string;
  script: string;
  description?: string;
  result: unknown;
}

/** Normalized agent response consumed by the canvas execution engine. */
export interface AgentRunResult {
  status: "done" | "error";
  result: string;
  data?: Record<string, unknown>;
  errorMessage?: string;
  /** All run_script tool calls made during this agent run. */
  toolCalls?: ToolCallRecord[];
  /** The last / primary formula script — shown as the header in the script modal. */
  script?: string;
}
