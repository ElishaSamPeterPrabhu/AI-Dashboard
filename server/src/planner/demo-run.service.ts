import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PlannerService } from "./planner.service";
import { StoreService } from "../store/store.service";

const DEFAULT_DEMO_AGENT_ID = "df7b36b9-328a-41a5-8cd8-73d80c37ac46";

export interface DemoRunStep {
  label: string;
  detail?: string;
}

export interface DemoRunSessionInput {
  prompt: string;
  threadId: string | null;
  runId: string | null;
  workflowId: string | null;
}

export interface DemoRunResponse {
  steps: DemoRunStep[];
  workflowId: string | null;
  finalText: string;
  /** Trimble Agent Service session — pass back on the next POST for multi-turn chat. */
  threadId: string | null;
  runId: string | null;
  /** Last parsed envelope `type` (for debugging / UI). */
  envelopeType?: "chat" | "workflow" | "edit";
  error?: string;
  /** Agent UUID used for `POST .../v1/agents/{id}/runs`. */
  agentId: string;
}

/** Agent instruction format: one JSON object per reply (optionally inside a ```json fence). */
export type AgentEnvelope =
  | { type: "chat"; message: string }
  | { type: "workflow"; message: string; plan: WorkflowPlan }
  | { type: "edit"; message: string; workflowId?: string; patches: EditPatch[] };

export interface EditPatch {
  key: string;
  value?: unknown;
  formula?: string;
  description?: string;
  label?: string;
}

interface WorkflowNode {
  key?: string;
  label: string;
  type: string;
  description?: string;
  formula?: string;
  value?: unknown;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}

interface WorkflowEdge {
  source: string;
  target: string;
}

interface WorkflowPlan {
  name?: string;
  projectId?: string;
  summary?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

// ── AG-UI SSE ───────────────────────────────────────────────────────────────

interface AgUiBase {
  type: string;
}
interface RunStartedEvent extends AgUiBase {
  type: "RUN_STARTED";
  threadId?: string;
  runId?: string;
}
interface TextContentEvent extends AgUiBase {
  type: "TEXT_MESSAGE_CONTENT" | "TEXT_MESSAGE_CHUNK";
  delta: string;
}
interface ToolCallStartEvent extends AgUiBase {
  type: "TOOL_CALL_START";
  toolCallId: string;
  toolCallName: string;
}
interface ToolCallArgsEvent extends AgUiBase {
  type: "TOOL_CALL_ARGS";
  toolCallId: string;
  delta: string;
}
interface ToolCallEndEvent extends AgUiBase {
  type: "TOOL_CALL_END";
  toolCallId: string;
}
interface StateSnapshotEvent extends AgUiBase {
  type: "STATE_SNAPSHOT";
  snapshot: Record<string, unknown>;
}
interface RunFinishedEvent extends AgUiBase {
  type: "RUN_FINISHED";
}
interface RunErrorEvent extends AgUiBase {
  type: "RUN_ERROR";
  message: string;
}
type AgUiEvent =
  | RunStartedEvent
  | TextContentEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StateSnapshotEvent
  | RunFinishedEvent
  | RunErrorEvent
  | AgUiBase;

interface TurnResult {
  threadId?: string;
  runId?: string;
  text: string;
  snapshot?: Record<string, unknown>;
  errorMessage?: string;
  runFinished: boolean;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

@Injectable()
export class DemoRunService {
  private readonly logger = new Logger(DemoRunService.name);

  constructor(
    private readonly planner: PlannerService,
    private readonly store: StoreService
  ) {}

  private get agentBase(): string {
    return (process.env.TRIMBLE_AGENT_BASE_URL ?? "").replace(/\/$/, "");
  }

  private get apiKey(): string {
    return process.env.TRIMBLE_AGENT_API_KEY ?? "";
  }

  private get demoAgentId(): string {
    return (
      process.env.DEMO_PLANNER_AGENT_ID?.trim() || DEFAULT_DEMO_AGENT_ID
    );
  }

  private async consumeSseStream(
    body: ReadableStream<Uint8Array>
  ): Promise<TurnResult> {
    const decoder = new TextDecoder();
    const reader = body.getReader();

    let text = "";
    let snapshot: Record<string, unknown> | undefined;
    let errorMessage: string | undefined;
    let threadId: string | undefined;
    let runId: string | undefined;
    let runFinished = false;
    let done = false;

    const pending = new Map<string, { name: string; argsJson: string }>();
    const completedToolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }> = [];

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
              try {
                args = JSON.parse(p.argsJson) as Record<string, unknown>;
              } catch {
                /* ignore */
              }
              completedToolCalls.push({
                id: e.toolCallId,
                name: p.name,
                args,
              });
              pending.delete(e.toolCallId);
            }
            break;
          }
          case "STATE_SNAPSHOT":
            snapshot = (event as StateSnapshotEvent).snapshot;
            break;
          case "RUN_FINISHED":
            runFinished = true;
            break;
          case "RUN_ERROR":
            errorMessage = (event as RunErrorEvent).message;
            break;
        }
      }
    }

    if (!snapshot && text.trimStart().startsWith("{")) {
      try {
        snapshot = JSON.parse(text) as Record<string, unknown>;
      } catch {
        /* plain text */
      }
    }

    return { threadId, runId, text, snapshot, errorMessage, runFinished, toolCalls: completedToolCalls };
  }

  /**
   * Parse strict agent envelope JSON. On failure → synthetic `chat` envelope with raw excerpt.
   */
  parseEnvelope(text: string): AgentEnvelope {
    let raw = text.trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) raw = fence[1].trim();

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const t = parsed.type;
      const msg = typeof parsed.message === "string" ? parsed.message : "";
      if (t === "chat") {
        return { type: "chat", message: msg || "(empty message)" };
      }

      if (t === "workflow") {
        const plan = parsed.plan as WorkflowPlan | undefined;
        if (!plan || !Array.isArray(plan.nodes))
          throw new Error("workflow envelope missing plan.nodes");
        return {
          type: "workflow",
          message: msg || "Workflow submitted.",
          plan,
        };
      }

      if (t === "edit") {
        const patches = parsed.patches;
        if (!Array.isArray(patches))
          throw new Error("edit envelope missing patches[]");
        return {
          type: "edit",
          message: msg || "Edit submitted.",
          workflowId:
            typeof parsed.workflowId === "string" ? parsed.workflowId : undefined,
          patches: patches as EditPatch[],
        };
      }
    } catch (e) {
      this.logger.warn(`parseEnvelope fallback: ${(e as Error).message}`);
    }

    const excerpt =
      raw.length > 6000 ? `${raw.slice(0, 5997)}…` : raw || text.trim();
    return { type: "chat", message: excerpt || "(empty agent reply)" };
  }

  /** Execution summary for resume message (strict JSON — easy for Studio agent to consume). */
  private buildFeedbackPayload(ok: boolean, workflowId: string, nodeResultsByKey: Record<string, unknown>, errorDetail?: string) {
    return {
      kind: "bff_execution_result",
      version: 1,
      ok,
      workflowId,
      nodeResultsByKey,
      ...(errorDetail ? { errorDetail } : {}),
    };
  }

  private collectExecutionSnapshot(workflowId: string): Record<string, unknown> {
    const canvas = this.store.getCanvas(workflowId);
    const nodes = canvas.nodes as Array<{
      type?: string;
      data?: Record<string, unknown>;
    }>;
    const out: Record<string, unknown> = {};
    for (const n of nodes) {
      const pk = String(n.data?.plannerKey ?? "").trim();
      if (!pk) continue;
      const d = n.data ?? {};
      out[pk] = {
        reactType: n.type ?? "",
        label: d.label ?? "",
        displayResult: d._result ?? null,
        value: d.value ?? d.executionResult ?? null,
      };
    }
    return out;
  }

  private applyEditPatches(workflowId: string, patches: EditPatch[]): void {
    const canvas = this.store.getCanvas(workflowId);
    const nodes = structuredClone(canvas.nodes) as Array<{
      id: string;
      type?: string;
      data?: Record<string, unknown>;
    }>;

    for (const p of patches) {
      const node = nodes.find((n) => String(n.data?.plannerKey) === p.key);
      if (!node) {
        this.logger.warn(`[demo] patch: no node with plannerKey=${p.key}`);
        continue;
      }
      const d = { ...(node.data ?? {}) };
      clearExecFields(d);

      if (p.label !== undefined) d.label = p.label;
      if (p.description !== undefined) d.description = p.description;
      if ("value" in p && p.value !== undefined) {
        d.value = p.value;
        d.executionResult = p.value;
      }
      if (p.formula !== undefined) d.formula = p.formula;

      node.data = d;
    }

    const found = this.store.findWorkflowById(workflowId);
    if (found) this.store.touchWorkflow(found.projectId, workflowId);

    this.store.saveCanvas(workflowId, { nodes: nodes as unknown[], edges: canvas.edges });
  }

  private async executePlanToCanvas(
    plan: WorkflowPlan,
    steps: DemoRunStep[]
  ): Promise<string> {
    const wfArgs = {
      name: plan.name ?? "AI Planner Workflow",
      projectId: plan.projectId ?? "p1",
    };
    const wfResult = (await this.planner.callTool(
      "create_workflow",
      wfArgs
    )) as { workflowId?: string };
    const workflowId = wfResult?.workflowId ?? randomUUID();
    steps.push({ label: "create_workflow", detail: `workflowId: ${workflowId}` });

    const nodeIdMap: Record<string, string> = {};

    for (const node of plan.nodes ?? []) {
      const plannerKey =
        typeof node.key === "string" && node.key.trim()
          ? node.key.trim()
          : node.label?.trim() || `n-${randomUUID().slice(0, 8)}`;

      const {
        key: _omitKey,
        label,
        description,
        formula,
        value,
        data: rawData,
        ...rest
      } = node as WorkflowNode & {
        formula?: string;
        value?: unknown;
        data?: Record<string, unknown>;
      };

      const nodeData: Record<string, unknown> = {
        label,
        plannerKey,
        ...(description !== undefined ? { description } : {}),
        ...(formula !== undefined ? { formula } : {}),
        ...(value !== undefined ? { value, executionResult: value } : {}),
        ...(rawData ?? {}),
      };

      const nodeArgs = { workflowId, node: { ...rest, data: nodeData } };
      const nodeResult = (await this.planner.callTool(
        "add_node",
        nodeArgs
      )) as { nodeId?: string };

      const nodeId = nodeResult?.nodeId ?? randomUUID();
      nodeIdMap[plannerKey] = nodeId;
      steps.push({ label: `add_node: ${label}`, detail: `nodeId: ${nodeId}` });
    }

    for (const edge of plan.edges ?? []) {
      const source = nodeIdMap[edge.source];
      const target = nodeIdMap[edge.target];
      if (!source || !target) {
        steps.push({
          label: `connect_nodes: ${edge.source}→${edge.target}`,
          detail: "skipped: unknown key",
        });
        continue;
      }
      await this.planner.callTool("connect_nodes", {
        workflowId,
        source,
        target,
      });
      steps.push({ label: `connect_nodes: ${edge.source}→${edge.target}` });
    }

    await this.planner.callTool("execute_workflow", { workflowId });
    steps.push({ label: "execute_workflow", detail: `workflowId: ${workflowId}` });

    return workflowId;
  }

  /** POST Trimble Agent run and return streamed text + ids. tools: empty — agent returns envelope in text only. */
  private async agentPost(
    messages: Array<{ id: string; role: string; content: string }>,
    opts: {
      threadId: string | null;
      runId: string | null;
      contextSnippet: string;
      isConversationStart: boolean;
    }
  ): Promise<{ result: TurnResult; httpOk: boolean; httpBody?: string }> {
    const agentId = this.demoAgentId;
    const body = {
      threadId: opts.threadId,
      runId: opts.runId,
      state: null,
      messages,
      tools: [],
      context: opts.isConversationStart
        ? [
            {
              description: "user_request",
              value: opts.contextSnippet.slice(0, 2000),
            },
          ]
        : [],
      forwardedProps: opts.isConversationStart
        ? { nodeId: "demo-ui", workflowId: "demo-ui" }
        : null,
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
      return { result: dummyTurnResult(text), httpOk: false, httpBody: text };
    }

    const result = await this.consumeSseStream(response.body);
    return { result, httpOk: true };
  }

  async run(input: DemoRunSessionInput): Promise<DemoRunResponse> {
    const agentId = this.demoAgentId;
    const steps: DemoRunStep[] = [];
    const empty = (): DemoRunResponse => ({
      steps,
      workflowId: input.workflowId,
      finalText: "",
      threadId: input.threadId,
      runId: input.runId,
      agentId,
    });

    if (!this.agentBase || !this.apiKey) {
      return {
        ...empty(),
        workflowId: null,
        threadId: null,
        runId: null,
        error:
          "Trimble Agent Service is not configured (set TRIMBLE_AGENT_BASE_URL and TRIMBLE_AGENT_API_KEY in server/.env).",
      };
    }

    const trimmed = input.prompt?.trim() ?? "";
    if (!trimmed) {
      return { ...empty(), error: "prompt is required" };
    }

    // Always start a fresh run — only threadId is needed to continue the thread.
    // Reusing a finished runId causes 409 "no pending tool calls found".
    const isConversationStart = !input.threadId;

    const agentTurn = await this.agentPost(
      [
        {
          id: randomUUID(),
          role: "user",
          content: trimmed,
        },
      ],
      {
        threadId: input.threadId,
        runId: null,
        contextSnippet: trimmed,
        isConversationStart,
      }
    );

    if (!agentTurn.httpOk || !agentTurn.result) {
      let err =
        typeof agentTurn.httpBody === "string"
          ? `Agent Service error: ${agentTurn.httpBody}`
          : "Agent Service request failed.";
      if (/403/.test(agentTurn.httpBody ?? "")) {
        err +=
          ` — Permission denied for agent ${agentId}. The JWT in TRIMBLE_AGENT_API_KEY must be allowed to run that agent in Studio (ACL / app access). ` +
          `Set DEMO_PLANNER_AGENT_ID in server/.env to your agent UUID (not only VITE_* in the UI).`;
      }
      return { ...empty(), threadId: null, runId: null, error: err };
    }

    const tr = agentTurn.result;
    if (tr.errorMessage) {
      return {
        ...empty(),
        threadId: tr.threadId ?? input.threadId,
        runId: tr.runId ?? input.runId,
        finalText: tr.text.trim(),
        error: tr.errorMessage,
      };
    }

    let threadId = tr.threadId ?? input.threadId;
    let runId = tr.runId ?? input.runId;
    const agentText = tr.text.trim();
    this.logger.log(`[demo] agent reply:\n${agentText.slice(0, 4000)}`);

    const envelope = this.parseEnvelope(agentText);
    let lastWorkflowId: string | null = input.workflowId;
    let envelopeType: DemoRunResponse["envelopeType"] = envelope.type;

    const respond = (
      finalText: string,
      wf: string | null,
      extras?: Partial<DemoRunResponse>
    ): DemoRunResponse => ({
      steps,
      workflowId: wf,
      finalText,
      threadId,
      runId,
      envelopeType,
      agentId,
      ...extras,
    });

    try {
      if (envelope.type === "chat") {
        return respond(envelope.message, lastWorkflowId);
      }

      if (envelope.type === "edit") {
        const wfTarget =
          (envelope.workflowId?.trim() || input.workflowId || "").trim() ||
          null;
        if (!wfTarget || !this.store.findWorkflowById(wfTarget)) {
          return respond(
            envelope.message,
            lastWorkflowId,
            {
              error:
                `edit: unknown workflow — set workflowId or build a workflow first. Requested ${envelope.workflowId ?? "(none)"}.`,
              envelopeType: "edit",
            }
          );
        }

        steps.push({ label: "edit: patches", detail: `${envelope.patches.length} patch(es)` });
        this.applyEditPatches(wfTarget, envelope.patches);
        await this.planner.callTool("execute_workflow", { workflowId: wfTarget });
        steps.push({
          label: "execute_workflow",
          detail: `(after edit) workflowId: ${wfTarget}`,
        });

        lastWorkflowId = wfTarget;

        const fbPayload = this.buildFeedbackPayload(
          true,
          wfTarget,
          this.collectExecutionSnapshot(wfTarget)
        );
        steps.push({
          label: "agent_resume",
          detail: "(edit) execution results sent back to Studio agent",
        });

        const resumeTxt = await this.resumeAfterBff(
          threadId,
          runId,
          fbPayload,
          trimmed,
          steps,
          ({ t, r }) => {
            threadId = t;
            runId = r;
          }
        );

        return respond(
          [envelope.message, resumeTxt].filter(Boolean).join("\n\n"),
          lastWorkflowId,
          { envelopeType: "edit" }
        );
      }

      if (envelope.type === "workflow") {
        const wfIdExisting = await this.executePlanToCanvas(envelope.plan, steps);
        lastWorkflowId = wfIdExisting;

        const fbPayload = this.buildFeedbackPayload(
          true,
          wfIdExisting,
          this.collectExecutionSnapshot(wfIdExisting)
        );

        steps.push({
          label: "agent_resume",
          detail: "(workflow) execution results sent back to Studio agent",
        });

        const resumeTxt = await this.resumeAfterBff(
          threadId,
          runId,
          fbPayload,
          trimmed,
          steps,
          ({ t, r }) => {
            threadId = t;
            runId = r;
          }
        );

        const tail = resumeTxt
          ? resumeTxt
          : `Executed workflow **${wfIdExisting}**. (No follow-up envelope from agent after resume.)`;
        return respond(
          [envelope.message, tail].filter(Boolean).join("\n\n"),
          lastWorkflowId,
          { envelopeType: "workflow" }
        );
      }

      return respond("Unexpected envelope branch.", lastWorkflowId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[demo] ${msg}`, err instanceof Error ? err.stack : undefined);
      return respond(agentText || msg, lastWorkflowId ?? input.workflowId, {
        error: msg,
      });
    }
  }

  /** Single follow-up POST with BFF execution JSON so Studio agent can answer in-thread. Returns assistant excerpt or null. */
  private async resumeAfterBff(
    threadIdIn: string | null,
    runIdIn: string | null,
    fbPayload: ReturnType<DemoRunService["buildFeedbackPayload"]>,
    contextSnippet: string,
    steps: DemoRunStep[],
    setIds: (ids: { t: string | null; r: string | null }) => void
  ): Promise<string | null> {
    if (!threadIdIn || !runIdIn) {
      steps.push({
        label: "agent_resume",
        detail:
          "skipped: missing threadId/runId — cannot notify agent of execution results",
      });
      return null;
    }

    const content = `\`\`\`json\n${JSON.stringify(fbPayload)}\n\`\`\``;

    // The previous run is finished; send as a new run in the same thread.
    // Passing runId of a completed run causes 409 "no pending tool calls".
    const { result: tr, httpOk } = await this.agentPost(
      [{ id: randomUUID(), role: "user", content }],
      {
        threadId: threadIdIn,
        runId: null,
        contextSnippet,
        isConversationStart: false,
      }
    );

    if (!httpOk || tr.errorMessage) {
      steps.push({
        label: "agent_resume",
        detail: !httpOk
          ? "resume HTTP failed"
          : `RUN_ERROR ${tr.errorMessage ?? ""}`,
      });
      return null;
    }

    const t = tr.threadId ?? threadIdIn;
    const r = tr.runId ?? runIdIn;
    setIds({ t, r });

    this.logger.log(
      `[demo] resume agent reply:\n${tr.text.trim().slice(0, 4000)}`
    );

    const follow = this.parseEnvelope(tr.text);

    if (follow.type === "workflow" || follow.type === "edit") {
      steps.push({
        label: "agent_resume_notice",
        detail: `Agent returned ${follow.type} after resume; client should send next prompt to continue.`,
      });
      return null;
    }

    return follow.message;
  }
}

function dummyTurnResult(text: string): TurnResult {
  return {
    text,
    runFinished: true,
    toolCalls: [],
  };
}

function clearExecFields(d: Record<string, unknown>): void {
  delete d.executionState;
  delete d.status;
  delete d._result;
  delete d._resultRaw;
  delete d._toolCalls;
  delete d._script;
}
