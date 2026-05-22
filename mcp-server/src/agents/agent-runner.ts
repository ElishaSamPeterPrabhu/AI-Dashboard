// Agent runner — ported from server/src/agents/agents.service.ts
// NestJS and ScriptRunnerService replaced with inline script execution.

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { getApiKey } from './token-manager.js';

export interface AgentRunRequestDto {
  nodeId: string;
  workflowId: string;
  systemPrompt: string;
  inputContext: Record<string, unknown>;
}

export interface ToolCallRecord {
  id: string;
  script: string;
  description?: string;
  result: unknown;
}

export interface AgentRunResultDto {
  status: 'done' | 'error';
  result: string;
  data?: Record<string, unknown>;
  errorMessage?: string;
  toolCalls?: ToolCallRecord[];
  script?: string;
}

// ── AG-UI event shapes ─────────────────────────────────────────────────────
interface AgUiBase { type: string; }
interface RunStartedEvent extends AgUiBase { type: 'RUN_STARTED'; threadId?: string; runId?: string; }
interface TextContentEvent extends AgUiBase { type: 'TEXT_MESSAGE_CONTENT' | 'TEXT_MESSAGE_CHUNK'; delta: string; }
interface ToolCallStartEvent extends AgUiBase { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string; }
interface ToolCallArgsEvent extends AgUiBase { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string; }
interface ToolCallEndEvent extends AgUiBase { type: 'TOOL_CALL_END'; toolCallId: string; }
interface StateSnapshotEvent extends AgUiBase { type: 'STATE_SNAPSHOT'; snapshot: Record<string, unknown>; }
interface RunErrorEvent extends AgUiBase { type: 'RUN_ERROR'; message: string; }
type AgUiEvent = RunStartedEvent | TextContentEvent | ToolCallStartEvent | ToolCallArgsEvent
  | ToolCallEndEvent | StateSnapshotEvent | RunErrorEvent | AgUiBase;

interface TurnResult {
  threadId?: string; runId?: string;
  text: string;
  snapshot?: Record<string, unknown>;
  errorMessage?: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

const MAX_TURNS = 5;

const RUN_SCRIPT_TOOL = {
  name: 'run_script',
  description: 'Execute a JavaScript expression with inputContext variables as globals. Returns the computed result.',
  parameters: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'A JS expression or function body.' },
      description: { type: 'string', description: 'One-line description of what this computes.' },
    },
    required: ['script'],
  },
};

// Simple script runner (replaces ScriptRunnerService)
function executeScript(script: string, context: Record<string, unknown>): { result?: unknown; error?: string } {
  try {
    const keys = Object.keys(context);
    const vals = keys.map(k => context[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `return (${script})`);
    return { result: fn(...vals) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function consumeSseStream(body: ReadableStream<Uint8Array>): Promise<TurnResult> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let text = '', done = false;
  let snapshot: Record<string, unknown> | undefined;
  let errorMessage: string | undefined, threadId: string | undefined, runId: string | undefined;
  const pending = new Map<string, { name: string; argsJson: string }>();
  const completedToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    done = streamDone;
    if (!value) continue;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      let event: AgUiEvent;
      try { event = JSON.parse(json) as AgUiEvent; } catch { continue; }
      switch (event.type) {
        case 'RUN_STARTED': { const e = event as RunStartedEvent; if (e.threadId) threadId = e.threadId; if (e.runId) runId = e.runId; break; }
        case 'TEXT_MESSAGE_CONTENT':
        case 'TEXT_MESSAGE_CHUNK': text += (event as TextContentEvent).delta; break;
        case 'TOOL_CALL_START': { const e = event as ToolCallStartEvent; pending.set(e.toolCallId, { name: e.toolCallName, argsJson: '' }); break; }
        case 'TOOL_CALL_ARGS': { const e = event as ToolCallArgsEvent; const p = pending.get(e.toolCallId); if (p) p.argsJson += e.delta; break; }
        case 'TOOL_CALL_END': { const e = event as ToolCallEndEvent; const p = pending.get(e.toolCallId); if (p) { let args: Record<string, unknown> = {}; try { args = JSON.parse(p.argsJson) as Record<string, unknown>; } catch { /**/ } completedToolCalls.push({ id: e.toolCallId, name: p.name, args }); pending.delete(e.toolCallId); } break; }
        case 'STATE_SNAPSHOT': snapshot = (event as StateSnapshotEvent).snapshot; break;
        case 'RUN_ERROR': errorMessage = (event as RunErrorEvent).message; break;
      }
    }
  }
  if (!snapshot && text.trimStart().startsWith('{')) {
    try { snapshot = JSON.parse(text) as Record<string, unknown>; } catch { /**/ }
  }
  return { threadId, runId, text, snapshot, errorMessage, toolCalls: completedToolCalls };
}

function buildStructuredData(text: string, toolCalls: ToolCallRecord[], snapshot?: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(snapshot ?? {}) };
  if (text) data['risk_summary'] = text;
  let largest: number | null = null;
  for (const tc of toolCalls) {
    if (!tc.script?.trim()) continue;
    const num = typeof tc.result === 'number' ? tc.result : null;
    if (num === null) continue;
    if (tc.description) { const key = tc.description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, ''); data[key] = num; }
    if (largest === null || num > largest) largest = num;
  }
  if (largest !== null) data['adjusted_cost'] = largest;
  return data;
}

export async function runAgent(agentId: string, dto: AgentRunRequestDto): Promise<AgentRunResultDto> {
  const apiKey = getApiKey();
  if (!apiKey) return mockRun(agentId, dto);

  try {
    return await liveRun(agentId, dto, apiKey);
  } catch (err) {
    console.warn(`Live agent run failed (${agentId}): ${(err as Error).message} — falling back to mock`);
    return mockRun(agentId, dto);
  }
}

async function liveRun(agentId: string, dto: AgentRunRequestDto, apiKey: string): Promise<AgentRunResultDto> {
  let threadId: string | null = null, runId: string | null = null;
  const allToolCalls: ToolCallRecord[] = [];

  const context = Object.entries(dto.inputContext)
    .slice(0, 10)
    .map(([k, v]) => ({ description: k, value: typeof v === 'string' ? v : JSON.stringify(v) }));

  let messages: unknown[] = [{
    id: randomUUID(),
    role: 'user',
    content: dto.systemPrompt
      ? `${dto.systemPrompt}\n\nInput context:\n${JSON.stringify(dto.inputContext, null, 2)}`
      : JSON.stringify(dto.inputContext),
  }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await fetch(
      `${config.agent.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          threadId: threadId ?? null,
          runId: runId ?? null,
          state: null,
          messages,
          tools: [RUN_SCRIPT_TOOL],
          context: turn === 0 ? context : [],
          forwardedProps: turn === 0 ? { nodeId: dto.nodeId, workflowId: dto.workflowId } : null,
        }),
      }
    );

    if (!response.ok || !response.body) {
      const txt = await response.text().catch(() => response.statusText);
      throw new Error(`Agent Service ${response.status}: ${txt}`);
    }

    const tr = await consumeSseStream(response.body);
    if (tr.threadId) threadId = tr.threadId;
    if (tr.runId) runId = tr.runId;
    if (tr.errorMessage) return { status: 'error', result: '', errorMessage: tr.errorMessage };

    const meaningfulCalls = tr.toolCalls.filter(tc => (tc.args as { script?: string }).script?.trim());

    if (tr.toolCalls.length === 0 || meaningfulCalls.length === 0) {
      const aiText = tr.text?.trim() || (allToolCalls.length ? `${allToolCalls.at(-1)?.script} = ${String(allToolCalls.at(-1)?.result)}` : '');
      const script = allToolCalls.at(-1)?.script;
      return { status: 'done', result: aiText, data: buildStructuredData(tr.text, allToolCalls, tr.snapshot), toolCalls: allToolCalls, ...(script ? { script } : {}) };
    }

    for (const tc of meaningfulCalls) {
      const args = tc.args as { script?: string; description?: string };
      const { result, error } = executeScript(args.script!, dto.inputContext);
      allToolCalls.push({ id: tc.id, script: args.script!, description: args.description, result: error ? { error } : result });
      messages = [{ id: randomUUID(), role: 'tool', toolCallId: tc.id, content: JSON.stringify(error ? { error } : result) }];
    }
  }

  return { status: 'done', result: `[Max turns reached]`, data: buildStructuredData('', allToolCalls), toolCalls: allToolCalls };
}

function mockRun(agentId: string, dto: AgentRunRequestDto): AgentRunResultDto {
  const keys = Object.keys(dto.inputContext);
  const formula = keys.length >= 2 ? keys.slice(0, 3).join(' * ') : keys[0] ?? '0';
  const { result, error } = executeScript(formula, dto.inputContext as Record<string, unknown>);
  const resultStr = error ? `Error: ${error}` : `${formula} = ${JSON.stringify(result)}`;
  const toolCall: ToolCallRecord = { id: randomUUID(), script: formula, description: 'Auto-synthesised from context', result: error ? { error } : result };
  return {
    status: 'done',
    result: `[Mock · agent ${agentId}] ${resultStr}`,
    data: { ...dto.inputContext, adjusted_cost: typeof result === 'number' ? result : null },
    toolCalls: [toolCall],
    script: formula,
  };
}
