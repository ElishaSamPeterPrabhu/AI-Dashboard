import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ScriptRunnerService } from "../mcp/script-runner.service";

// ── BFF-facing DTO ────────────────────────────────────────────────────────────

export interface AgentRunRequestDto {
  nodeId: string;
  workflowId: string;
  systemPrompt: string;
  inputContext: Record<string, unknown>;
  outputSchema?: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
  };
}

export interface ToolCallRecord {
  id: string;
  script: string;
  description?: string;
  result: unknown;
}

export interface AgentRunResultDto {
  status: "done" | "error";
  result: string;
  data?: Record<string, unknown>;
  errorMessage?: string;
  toolCalls?: ToolCallRecord[];
  /** Last / primary formula script (the final run_script call, for the modal header). */
  script?: string;
}

// ── AG-UI event shapes ────────────────────────────────────────────────────────

interface AgUiBase { type: string; }
interface RunStartedEvent extends AgUiBase { type: "RUN_STARTED"; threadId?: string; runId?: string; }
interface TextContentEvent extends AgUiBase { type: "TEXT_MESSAGE_CONTENT" | "TEXT_MESSAGE_CHUNK"; delta: string; }
interface ToolCallStartEvent extends AgUiBase { type: "TOOL_CALL_START"; toolCallId: string; toolCallName: string; }
interface ToolCallArgsEvent extends AgUiBase { type: "TOOL_CALL_ARGS"; toolCallId: string; delta: string; }
interface ToolCallEndEvent extends AgUiBase { type: "TOOL_CALL_END"; toolCallId: string; }
interface StateSnapshotEvent extends AgUiBase { type: "STATE_SNAPSHOT"; snapshot: Record<string, unknown>; }
interface RunErrorEvent extends AgUiBase { type: "RUN_ERROR"; message: string; }
type AgUiEvent =
  | RunStartedEvent | TextContentEvent
  | ToolCallStartEvent | ToolCallArgsEvent | ToolCallEndEvent
  | StateSnapshotEvent | RunErrorEvent | AgUiBase;

// ── Per-turn result ───────────────────────────────────────────────────────────

interface TurnResult {
  threadId?: string;
  runId?: string;
  text: string;
  snapshot?: Record<string, unknown>;
  errorMessage?: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_TURNS = 5;

const RUN_SCRIPT_TOOL = {
  name: "run_script",
  description:
    "Execute a JavaScript expression with the inputContext variables injected as globals. " +
    "Returns the computed numeric or string result. " +
    "Use this to verify calculations, try out formulas, and validate simulations before giving a final answer.",
  parameters: {
    type: "object",
    properties: {
      script: {
        type: "string",
        description:
          "A JS expression (e.g. `teamSize * velocity * 800`) or a self-contained function body. " +
          "The last evaluated value is returned.",
      },
      description: {
        type: "string",
        description: "One-line human-readable description of what this script computes. Shown to the user.",
      },
    },
    required: ["script"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TrimbleAgentsService {
  private readonly logger = new Logger(TrimbleAgentsService.name);

  private get agentBase(): string {
    return (process.env.TRIMBLE_AGENT_BASE_URL ?? "").replace(/\/$/, "");
  }

  private get apiKey(): string {
    return process.env.TRIMBLE_AGENT_API_KEY ?? "";
  }

  constructor(private readonly scriptRunner: ScriptRunnerService) {}

  get isConfigured(): boolean {
    return Boolean(this.agentBase && this.apiKey);
  }

  // ── Public entry point ────────────────────────────────────────────────────

  async run(agentId: string, dto: AgentRunRequestDto): Promise<AgentRunResultDto> {
    if (!this.isConfigured) {
      return this.mockRun(agentId, dto);
    }
    try {
      return await this.liveRun(agentId, dto);
    } catch (err) {
      this.logger.warn(
        `Live agent run failed (${agentId}): ${(err as Error).message} — falling back to mock`
      );
      return this.mockRun(agentId, dto);
    }
  }

  // ── Live: suspend/resume loop calling Trimble Agent Service ──────────────

  private async liveRun(agentId: string, dto: AgentRunRequestDto): Promise<AgentRunResultDto> {
    // threadId / runId start as null — service auto-creates on first call.
    // On resume, we send the same pair to continue the suspended run.
    let threadId: string | null = null;
    let runId: string | null = null;
    const allToolCalls: ToolCallRecord[] = [];

    // Turn 1: user message with inputContext + run_script tool + context array
    const context = Object.entries(dto.inputContext)
      .slice(0, 10) // max 10 context items per API spec
      .map(([k, v]) => ({ description: k, value: typeof v === "string" ? v : JSON.stringify(v) }));

    let messages: unknown[] = [
      {
        id: randomUUID(),
        role: "user",
        content: dto.systemPrompt
          ? `${dto.systemPrompt}\n\nInput context:\n${JSON.stringify(dto.inputContext, null, 2)}`
          : JSON.stringify(dto.inputContext),
      },
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const isFirstTurn = turn === 0;
      const body = {
        threadId: threadId ?? null,
        runId: runId ?? null,
        state: null,
        messages,
        tools: [RUN_SCRIPT_TOOL], // always pass tools so agent can call run_script on any turn
        context: isFirstTurn ? context : [],
        forwardedProps: isFirstTurn ? { nodeId: dto.nodeId, workflowId: dto.workflowId } : null,
      };

      const response = await fetch(
        `${this.agentBase}/v1/agents/${encodeURIComponent(agentId)}/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Agent Service ${response.status}: ${text}`);
      }

      const turn_result = await this.consumeSseStream(response.body);

      // Capture thread/run ids from RUN_STARTED for resume
      if (turn_result.threadId) threadId = turn_result.threadId;
      if (turn_result.runId) runId = turn_result.runId;

      if (turn_result.errorMessage) {
        return { status: "error", result: "", errorMessage: turn_result.errorMessage };
      }

      // No tool calls → agent is done, return the final answer
      if (turn_result.toolCalls.length === 0) {
        const script = allToolCalls.at(-1)?.script;
        return {
          status: "done",
          result: turn_result.text,
          data: this.buildStructuredData(turn_result.text, allToolCalls, turn_result.snapshot),
          toolCalls: allToolCalls,
          ...(script ? { script } : {}),
        };
      }

      // Filter out empty-script tool calls — the agent sends these as broken
      // first attempts. If ALL tool calls in this turn are empty, the run has
      // already finished (RUN_FINISHED) and we must NOT resume (→ 409).
      const meaningfulCalls = turn_result.toolCalls.filter(
        (tc) => (tc.args as { script?: string }).script?.trim()
      );

      if (meaningfulCalls.length === 0) {
        // No real tool calls — agent is done for this turn
        const script = allToolCalls.at(-1)?.script;
        return {
          status: "done",
          result: turn_result.text,
          data: this.buildStructuredData(turn_result.text, allToolCalls, turn_result.snapshot),
          toolCalls: allToolCalls,
          ...(script ? { script } : {}),
        };
      }

      // Execute each meaningful tool call locally then resume
      for (const tc of meaningfulCalls) {
        const args = tc.args as { script?: string; description?: string };
        const { result, error } = this.scriptRunner.execute(
          args.script!,
          dto.inputContext as Record<string, unknown>
        );

        allToolCalls.push({
          id: tc.id,
          script: args.script!,
          description: args.description,
          result: error ? { error } : result,
        });

        this.logger.debug(
          `Tool call [${tc.id}] run_script: ${args.script} → ${JSON.stringify(result ?? error)}`
        );

        // Resume: only send ToolMessage (service prepends history automatically)
        messages = [
          {
            id: randomUUID(),
            role: "tool",
            toolCallId: tc.id,
            content: JSON.stringify(error ? { error } : result),
          },
        ];
      }
    }

    // Exceeded MAX_TURNS — return whatever we have
    const script = allToolCalls.at(-1)?.script;
    return {
      status: "done",
      result: `[Reached max turns (${MAX_TURNS})] Context processed.`,
      data: this.buildStructuredData("", allToolCalls),
      toolCalls: allToolCalls,
      ...(script ? { script } : {}),
    };
  }

  /**
   * Build a structured data map from tool call results + parsed text so
   * downstream canvas nodes can receive values via `routeAgentOutputs`.
   *
   * Keys produced:
   *  - `adjusted_cost`  — largest numeric tool call result (the main computed value)
   *  - `risk_summary`   — the full text result
   *  - Any other numeric tool call result keyed by its snake_case description
   */
  private buildStructuredData(
    text: string,
    toolCalls: ToolCallRecord[],
    snapshot?: Record<string, unknown>
  ): Record<string, unknown> {
    const data: Record<string, unknown> = { ...(snapshot ?? {}) };

    // Always include the full text as risk_summary
    if (text) data["risk_summary"] = text;

    // Map numeric tool call results by description (snake_case)
    let largestNumeric: number | null = null;
    for (const tc of toolCalls) {
      // Skip empty/failed tool calls
      if (!tc.script?.trim()) continue;
      const num = typeof tc.result === "number" ? tc.result : null;
      if (num === null) continue;

      if (tc.description) {
        const key = tc.description
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/, "");
        data[key] = num;
      }

      // Track the largest numeric result as the primary adjusted cost
      if (largestNumeric === null || num > largestNumeric) largestNumeric = num;
    }

    // `adjusted_cost` = largest numeric result (risk-adjusted total is always biggest)
    if (largestNumeric !== null) data["adjusted_cost"] = largestNumeric;

    // Also try to parse numbers from the result text as fallback
    if (!data["adjusted_cost"] && text) {
      const match = text.match(/adjusted\s+cost[:\s]+([0-9,]+)/i);
      if (match) data["adjusted_cost"] = Number(match[1].replace(/,/g, ""));
    }

    return data;
  }

  // ── SSE stream consumer ───────────────────────────────────────────────────

  private async consumeSseStream(body: ReadableStream<Uint8Array>): Promise<TurnResult> {
    const decoder = new TextDecoder();
    const reader = body.getReader();

    let text = "";
    let snapshot: Record<string, unknown> | undefined;
    let errorMessage: string | undefined;
    let threadId: string | undefined;
    let runId: string | undefined;
    let done = false;

    // Accumulate in-flight tool calls: toolCallId → { name, argsJson }
    const pending = new Map<string, { name: string; argsJson: string }>();
    const completedToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (!value) continue;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const json = trimmed.slice(5).trim();
        if (!json || json === "[DONE]") continue;

        let event: AgUiEvent;
        try {
          event = JSON.parse(json) as AgUiEvent;
        } catch {
          continue;
        }

        switch (event.type) {
          case "RUN_STARTED": {
            const e = event as RunStartedEvent;
            if (e.threadId) threadId = e.threadId;
            if (e.runId) runId = e.runId;
            break;
          }
          case "TEXT_MESSAGE_CONTENT":
          case "TEXT_MESSAGE_CHUNK":
            text += (event as TextContentEvent).delta;
            break;
          case "TOOL_CALL_START": {
            const e = event as ToolCallStartEvent;
            pending.set(e.toolCallId, { name: e.toolCallName, argsJson: "" });
            break;
          }
          case "TOOL_CALL_ARGS": {
            const e = event as ToolCallArgsEvent;
            const p = pending.get(e.toolCallId);
            if (p) p.argsJson += e.delta;
            break;
          }
          case "TOOL_CALL_END": {
            const e = event as ToolCallEndEvent;
            const p = pending.get(e.toolCallId);
            if (p) {
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(p.argsJson) as Record<string, unknown>; } catch { /* ignore */ }
              completedToolCalls.push({ id: e.toolCallId, name: p.name, args });
              pending.delete(e.toolCallId);
            }
            break;
          }
          case "STATE_SNAPSHOT":
            snapshot = (event as StateSnapshotEvent).snapshot;
            break;
          case "RUN_ERROR":
            errorMessage = (event as RunErrorEvent).message;
            break;
        }
      }
    }

    // Parse text as JSON for structured data if snapshot not provided
    if (!snapshot && text.trimStart().startsWith("{")) {
      try { snapshot = JSON.parse(text) as Record<string, unknown>; } catch { /* plain text */ }
    }

    return { threadId, runId, text, snapshot, errorMessage, toolCalls: completedToolCalls };
  }

  // ── Mock fallback ─────────────────────────────────────────────────────────

  private mockRun(agentId: string, dto: AgentRunRequestDto): AgentRunResultDto {
    const keys = Object.keys(dto.inputContext ?? {});
    const formula = keys.length >= 2 ? keys.slice(0, 3).join(" * ") : keys[0] ?? "0";
    const { result, error } = this.scriptRunner.execute(formula, dto.inputContext as Record<string, unknown>);
    const resultStr = error ? `Error: ${error}` : `${formula} = ${JSON.stringify(result)}`;

    const toolCall: ToolCallRecord = {
      id: randomUUID(),
      script: formula,
      description: "Auto-synthesised formula from context keys: " + keys.join(", "),
      result: error ? { error } : result,
    };

    const numericResult = typeof result === "number" ? result : null;
    const summary = `[Mock · agent ${agentId}] ${resultStr}`;

    return {
      status: "done",
      result: summary,
      data: {
        ...dto.inputContext,
        _mockServer: true,
        adjusted_cost: numericResult,
        risk_summary: summary,
      },
      toolCalls: [toolCall],
      script: formula,
    };
  }

  // ── Agent provisioning ────────────────────────────────────────────────────

  async provisionAgent(dto: {
    name: string;
    systemPrompt: string;
    modelId?: string;
  }): Promise<{ agentId: string; agentName: string }> {
    if (!this.isConfigured) {
      throw new Error(
        "Agent provisioning requires TRIMBLE_AGENT_BASE_URL and TRIMBLE_AGENT_API_KEY"
      );
    }

    const body = {
      name: dto.name.slice(0, 64).trim(),
      description: dto.systemPrompt.slice(0, 200).trim(),
      systemPrompt: dto.systemPrompt,
      models: [{ name: dto.modelId ?? "gpt-4.1-nano" }],
      users: ["trimble-employee:true"],
      tools: [],
      retrieval: [],
    };

    const response = await fetch(`${this.agentBase}/v1/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Agent Service ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { id?: string; name?: string };
    const agentId = data.id ?? "";
    const agentName = data.name ?? dto.name;

    this.logger.log(`Provisioned agent: ${agentName} (${agentId})`);
    return { agentId, agentName };
  }

  // ── List agents ───────────────────────────────────────────────────────────

  async listAgents(search?: string): Promise<Array<{ id: string; name: string; description?: string }>> {
    if (!this.isConfigured) {
      return [];
    }

    try {
      // Use FIQL name filter if a search term is provided
      const params = new URLSearchParams({ pageSize: "50", fields: "description" });
      if (search?.trim()) {
        params.set("filter", `name==${encodeURIComponent(`*${search.trim()}*`)}`);
      }

      const response = await fetch(
        `${this.agentBase}/v1/agents?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }
      );

      if (!response.ok) return [];

      const data = (await response.json()) as {
        items?: Array<{ id: string; name: string; description?: string }>;
      };

      return (data.items ?? [])
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          createdBy: (a as Record<string, unknown>).createdBy as string | undefined,
        }))
        // Only show agents created by the current user (filter out shared workspace agents)
        // Your user ID: 5dd70b1b-050e-4ba2-9169-8d23f06d5bad
        .filter((a) => !a.createdBy || a.createdBy.includes("5dd70b1b-050e-4ba2-9169-8d23f06d5bad"))
        .map(({ createdBy: _, ...rest }) => rest)
        .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  /** Look up a single agent by ID — lets users verify a known agent ID. */
  async getAgent(agentId: string): Promise<{ id: string; name: string; description?: string } | null> {
    if (!this.isConfigured) return null;
    try {
      const response = await fetch(`${this.agentBase}/v1/agents/${encodeURIComponent(agentId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return null;
      const a = (await response.json()) as { id: string; name: string; description?: string };
      return { id: a.id, name: a.name, description: a.description };
    } catch {
      return null;
    }
  }
}
