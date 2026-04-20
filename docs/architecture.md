# Architecture

## Overview

AI Dashboard is a separate web application that consumes the Trimble Agentic AI Platform APIs. Its own backend is intentionally thin — the heavy lifting (LLM inference, agent state, knowledge retrieval, MCP tool calls) is delegated to the platform.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + React Flow + Modus WC)                      │
│                                                                   │
│  Canvas (React Flow)         Chat Panel (ModusAssistant iframe)  │
│  ├── Plan Mode               ├── Workflow Author Agent           │
│  └── Execute Mode            └── Workflow API MCP               │
│       ├── Node indicators                                        │
│       ├── Edge animation                                         │
│       └── Run timeline                                           │
└───────────────────┬──────────────────────────────────────────────┘
                    │ HTTP + WebSocket
┌───────────────────▼──────────────────────────────────────────────┐
│  Dashboard Backend (Node + TypeScript, Fastify)                   │
│  ├── Workflow persistence (JSON files → Postgres later)          │
│  ├── Simulation engine (DAG scheduler, Monte Carlo loops)        │
│  ├── AG UI stream proxy (SSE fan-out to canvas)                  │
│  └── Workflow API MCP server (for chatbot tool calls)            │
└───────────────────┬──────────────────────────────────────────────┘
                    │ HTTPS + TID OAuth
┌───────────────────▼──────────────────────────────────────────────┐
│  Trimble Agentic AI Platform                                      │
│  ├── Agent Service API    (create/invoke agents, threads, runs)  │
│  ├── Knowledge Base API   (library CRUD + search)                │
│  ├── Models & Inference   (OpenAI-compatible gateway)            │
│  ├── Ingest API           (document upload → knowledge)          │
│  └── Evals API            (future: eval nodes)                   │
└───────────────────┬──────────────────────────────────────────────┘
                    │ HTTP streamable + TID actor token
┌───────────────────▼──────────────────────────────────────────────┐
│  MCPs                                                             │
│  ├── Test MCP (mock Trimble data)                                │
│  ├── Trimble Connect MCP  (roadmap)                              │
│  ├── Trimble Viewpoint MCP (roadmap)                             │
│  └── Tekla / Maps / etc. (roadmap)                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Frontend Stack

Matches `modus-blueprint` exactly so components can be lifted directly:

| Concern | Choice | Rationale |
|---|---|---|
| Build tool | Vite 6 | Matches modus-blueprint; fast HMR |
| UI framework | React 19 | Matches modus-blueprint; `@trimble-oss/moduswebcomponents-react` requires React 19 |
| Language | TypeScript | Full type safety across node schemas and API contracts |
| Styling | Tailwind 4 | Matches modus-blueprint; utility-first, pairs with Modus tokens |
| Design system | `@trimble-oss/moduswebcomponents-react` 1.2.0-react19 | Trimble Modus Web Components — chrome, panels, buttons, badges, chips |
| Icons | `@trimble-oss/modus-icons` 1.21.0 | Matches modus-blueprint |
| Canvas | `@xyflow/react` (React Flow v12) | Best-in-class node-graph for React; rich API for custom nodes/edges |
| Canvas state | Zustand | Lightweight, works with React Flow's `useNodesState` |
| Server state | TanStack Query v5 | Caching, mutation, streaming for Agent Service API calls |
| Agentic SDK | `@trimble-agentic-external-npm-local/agentic-platform-sdk-iframe-typescript` | Iframe chat embed; already used in modus-blueprint `ModusAssistant.tsx` |
| Routing | React Router v6 | |
| Notifications | Sonner | Already in modus-blueprint |

---

## Backend Stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node 20 + TypeScript | Single language across frontend and backend |
| Framework | Fastify | Performant; SSE streaming support; plugin system |
| Validation | Zod | Shared schemas with frontend |
| Persistence | JSON files (MVP) → Postgres (v1) | Minimize early infra; Postgres when multi-user sharing arrives |
| Agent Service client | Thin hand-rolled client | Avoids generated SDK lock-in; covers only the endpoints we use |
| Script sandbox | QuickJS-emscripten | Isolates Calculator node formulas from filesystem and network |
| Test MCP server | Fastify plugin exposing HTTP streamable + TID auth | Same transport as real Trimble MCPs for identical wiring |

---

## Node Contract

Every node type implements this TypeScript interface. The same interface is used by the canvas renderer, the simulation engine, the chatbot tool schema, and the persistence layer.

```typescript
interface NodeDefinition<TConfig, TInputs, TOutputs> {
  type: string;                    // unique node type key
  version: number;                 // bumped on schema change
  label: string;
  config: TConfig;                 // node-level configuration (static)
  inputs: InputPortSchema[];       // port names + types
  outputs: OutputPortSchema[];     // port names + types

  // Plan Mode only
  validate(ctx: PlanContext): ValidationResult;

  // Execute Mode
  execute(inputs: TInputs, ctx: RunContext): AsyncGenerator<NodeEvent>;

  // Persistence
  serialize(): NodeSerializedState;
  deserialize(state: NodeSerializedState): void;
}
```

`execute` is an async generator so nodes can stream partial results. AI nodes yield events forwarded from the AG UI SSE stream. Calculator nodes yield a single terminal event.

---

## Workflow Schema (JSON)

Persisted per workflow. Versioned. Validated by Zod on load.

```typescript
interface WorkflowSchema {
  id: string;
  version: number;
  schemaVersion: number;           // bump when shape changes; triggers migration
  name: string;
  description?: string;
  createdAt: string;               // ISO 8601
  updatedAt: string;
  nodes: NodeState[];
  edges: EdgeState[];
  viewport: { x: number; y: number; zoom: number };
  defaultMode: "plan" | "execute";
}

interface NodeState {
  id: string;
  type: string;                    // matches NodeDefinition.type
  nodeVersion: number;             // matches NodeDefinition.version
  position: { x: number; y: number };
  config: object;                  // node-specific config (Zod-validated per type)
  // AI node specific:
  agentBinding?: AgentBinding;
}

interface AgentBinding {
  mode: "existing" | "provisioned";
  agentId: string;
  configId?: string;               // specific config version; null = use alias "production"
  description?: string;           // user-authored description (what triggered provisioning)
  descriptionHash?: string;        // SHA-256; invalidated when description changes
}

interface EdgeState {
  id: string;
  source: string;                  // node ID
  sourceHandle: string;            // output port name
  target: string;                  // node ID
  targetHandle: string;            // input port name
}
```

---

## Run Context Protocol

Input/Assumption node values are serialized into the AG UI `RunContext` format before every run. This is what the Agent Service API calls the "run context" — a description-value map:

```typescript
interface RunContextEntry {
  description: string;   // must be unique across the workflow; maps to {run.context.<description>}
  value: string;         // always string (numbers/objects JSON-stringified)
}

type RunContext = RunContextEntry[];
```

The simulation engine collects all Input and Assumption nodes in topological order, serializes them, and passes them as the `context` field when creating each agent run.

---

## Simulation Engine

Located in the backend. Runs per-workflow-execution.

### DAG scheduling

1. Build adjacency list from `edges`
2. Topological sort (Kahn's algorithm) — cycle detection returns an error to the canvas
3. **Depth validation**: trace all paths from root AI nodes; any path exceeding 3 AI-node hops (the platform subagent limit) is flagged as a validation error in Plan Mode
4. Identify independent parallel branches
5. Execute branches concurrently with `Promise.allSettled`

### Node execution

Each node type's `execute()` generator is called with its resolved input values. The engine collects emitted `NodeEvent`s and:
- Broadcasts them to the frontend via WebSocket (per-workflow-run channel)
- Stores them in the run artifact for history replay

### Run flavors

```typescript
type RunFlavor =
  | { type: "single" }
  | { type: "monte-carlo"; iterations: number }
  | { type: "live"; refreshMs: number };  // re-runs on MCP data change
```

For `monte-carlo`: the Monte Carlo Setup Agent generates N input sample sets. The engine queues N single-shot runs, batching concurrent executions (default max 5 parallel). After all runs complete, it aggregates outputs per node into `{ mean, p10, p50, p90, stdDev }`.

### Event protocol (WebSocket)

All events share a base shape, then extend per type:

```typescript
type NodeEventType =
  | "node:start"
  | "node:progress"
  | "node:value"
  | "node:error"
  | "node:end"
  | "edge:flow"
  | "tool:call"
  | "tool:result"
  | "run:end";

interface BaseNodeEvent {
  runId: string;
  iterationIndex?: number;         // for monte-carlo
  nodeId: string;
  type: NodeEventType;
  timestamp: string;
}
```

AI nodes forward AG UI events from the underlying agent run as `node:progress` (text streaming), `tool:call`, and `tool:result`. The frontend canvas maps these 1:1 to indicator states and edge animations.

---

## Agent Service Client

A minimal typed client wrapping `fetch`. No generated SDK — covers only the endpoints we need.

```typescript
class AgentServiceClient {
  constructor(private baseUrl: string, private getToken: () => Promise<string>) {}

  // Agent lifecycle
  createAgent(body: CreateAgentRequest): Promise<Agent>;
  getAgent(agentId: string, opts?: { fields?: string[] }): Promise<Agent>;
  listAgents(opts?: { filter?: string; pageSize?: number; skipToken?: string }): Promise<PagedAgents>;
  updateAgentConfig(agentId: string, body: UpdateConfigRequest): Promise<AgentConfig>;
  publishAlias(agentId: string, configId: string, alias: string): Promise<void>;
  deleteAgent(agentId: string, mode: "soft" | "hard"): Promise<void>;

  // Threads & runs
  createThread(agentId: string, body: CreateThreadRequest): Promise<Thread>;
  createRun(threadId: string, body: CreateRunRequest): Promise<ReadableStream>;  // SSE

  // Discovery
  listBuiltinTools(): Promise<BuiltinTool[]>;
  batchGet(ids: string[]): Promise<BatchGetResult>;

  // Usage
  getAgentUsage(agentId: string): Promise<UsageStats>;
}
```

Auth: the client calls `getToken()` before every request, which reads from `sessionStorage` (same as `ModusAssistant.tsx`) and triggers re-auth if expired.

---

## AG UI / SSE Consumer

The frontend's `useAgentRun()` hook consumes the SSE stream from a running agent:

```typescript
function useAgentRun(threadId: string, runId: string) {
  // Returns a stream of AgUiEvent[] + a close() function
  // Maps SUBAGENT_TEXT_MESSAGE_CONTENT → node:progress events for child AI nodes
  // Emits tool:call / tool:result → triggers edge animation on MCP/Knowledge edges
}
```

AG UI events are forwarded over the backend WebSocket so the canvas can render them without a direct browser-to-Agent-Service connection. This also allows the backend simulation engine to sequence multi-node runs correctly.

---

## Chatbot Integration

The chatbot panel is the `ModusAssistant` component from `modus-blueprint`, configured to point at the **Workflow Author Agent** (a dedicated Trimble Agent provisioned once per environment).

The Workflow Author Agent has an MCP tool attached: the **Workflow API MCP** — a Fastify plugin on the dashboard backend that exposes the internal workflow mutation API over the MCP HTTP streamable transport:

```
POST  /mcp  (tools: addNode, removeNode, connect, disconnect, setConfig,
             runWorkflow, stopWorkflow, explainNode, compareRuns, listAgents)
```

This means the chatbot can modify the canvas, run simulations, and compare scenarios without any special chat-to-canvas message-passing — it uses the same API the UI uses.

---

## Key Design Decisions

**Why a thin backend rather than serverless?**
The simulation engine needs stateful WebSocket connections per run. Serverless functions would require an external pub/sub layer. A single Node process (horizontally scalable behind a load balancer later) keeps it simple for MVP.

**Why not the OpenAPI-generated client?**
The Agent Service API is still evolving. A hand-rolled client that only covers the endpoints we use is easier to keep in sync and avoids generated-code churn.

**Why forward AG UI events through the backend?**
The canvas needs to coordinate events across multiple simultaneously running AI nodes. Routing everything through the backend WebSocket gives the simulation engine a single choke point to enforce ordering, rate limits, and run accounting.

**Why QuickJS for the Calculator sandbox?**
Calculator node formulas are user-authored JavaScript expressions. QuickJS runs them in a fully isolated Wasm sandbox — no `require`, no `fetch`, no filesystem access. Fast startup (~2ms) suitable for Monte Carlo inner loops.
