# Chatbot Specification

## Overview

The chatbot panel is a docked floating chat surface in the bottom-right of the canvas. It lets users create, edit, and run workflows using natural language instead of clicking.

The implementation reuses `ModusAssistant.tsx` from `modus-blueprint` almost verbatim, pointed at a dedicated **Workflow Author Agent** on the Trimble Agentic Platform. The agent has access to the **Workflow API MCP** — a set of tools that mirrors the internal workflow mutation API used by the canvas UI.

---

## Component Reuse: `ModusAssistant.tsx`

Located at `/Users/eprabhu/Desktop/Projects/modus-blueprint/src/components/modus-assistant/ModusAssistant.tsx`.

What it already provides:
- TID OAuth 2.0 PKCE flow (`openid agents` scopes), token storage in `sessionStorage`
- Iframe embed of the Trimble Assist chat UI for a specific `AGENT_ID`
- `listenToChatUi` and `listenToChatUiEvents` from the `@trimble-agentic-external-npm-local/agentic-platform-sdk-iframe-typescript` SDK
- Authenticated/unauthenticated state handling, login redirect
- `ModusWcButton`, `ModusWcIcon`, `ModusWcLoader` for the launcher button and states

**Changes needed for AI Dashboard:**
1. Set `AGENT_ID` to the Workflow Author Agent's ID (provisioned at deploy time)
2. Pass a `context` array to the iframe containing the active `workflowId` and current mode (`plan` / `execute`) so the agent knows which workflow to operate on
3. Listen for `ChatUiEventTypes.TOOL_RESULT` events to apply canvas diffs returned by the agent

Context is passed via the `contentVariants` / `ChatUiConfiguration` mechanism the SDK already supports.

---

## Workflow Author Agent

A single Trimble Agent provisioned once per environment (dev/staging/prod). Not a per-user or per-workflow agent.

**Agent config:**
- **Name:** `AI Dashboard Workflow Author`
- **Instructions:** "You are an expert workflow designer for AI Dashboard. You help users build, edit, and run visual AI workflows. When the user asks you to modify the canvas, call the appropriate workflow tool. Always confirm changes before applying them — show the user what you're about to do and ask for approval unless they explicitly said to proceed."
- **Model:** `gemini-2.5-flash` (or `gpt-4o` — configurable)
- **Built-in tools:** `datetime`, `myprofile`, `web_search`
- **MCP tool:** Workflow API MCP (see below)
- **ACL:** `users: ["trimble-employee:true"]` (or `users:*` for broader access)
- **Quota:** 200 runs / 200,000 tokens per day per user

---

## Workflow API MCP

A Fastify plugin on the dashboard backend exposed as an MCP server at:

```
POST /internal/workflow-mcp
Authorization: Bearer {actorToken?scopes=openid agents}
```

The Workflow Author Agent's config registers this URL as its MCP tool source. Every tool the agent calls arrives at the dashboard backend, which applies the mutation and sends a diff back to the canvas via WebSocket.

### Tools

#### `listWorkflows`
List workflows the current user has access to.
**Input:** `{ pageSize?: number, filter?: string }`
**Output:** `{ workflows: { id, name, updatedAt, nodeCount }[] }`

#### `getWorkflow`
Get the full serialized workflow for a given ID.
**Input:** `{ workflowId: string }`
**Output:** `WorkflowSchema`

#### `addNode`
Add a new node to the workflow canvas.
**Input:**
```json
{
  "workflowId": "string",
  "nodeType": "string",
  "label": "string",
  "config": "object",
  "position": { "x": "number", "y": "number" }
}
```
**Output:** `{ nodeId: string, diff: NodeDiff }`

#### `removeNode`
Remove a node and all its connected edges.
**Input:** `{ workflowId: string, nodeId: string }`
**Output:** `{ diff: NodeDiff }`

#### `connect`
Connect two node ports with an edge.
**Input:** `{ workflowId: string, sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort: string }`
**Output:** `{ edgeId: string, diff: EdgeDiff }`

#### `disconnect`
Remove an edge.
**Input:** `{ workflowId: string, edgeId: string }`
**Output:** `{ diff: EdgeDiff }`

#### `setNodeConfig`
Update a node's configuration.
**Input:** `{ workflowId: string, nodeId: string, config: object }`
**Output:** `{ diff: NodeDiff }`

#### `runWorkflow`
Start a workflow simulation.
**Input:** `{ workflowId: string, flavor?: "single" | "monte-carlo", iterations?: number }`
**Output:** `{ runId: string }` (execution streams via existing WebSocket)

#### `stopWorkflow`
Cancel a running simulation.
**Input:** `{ workflowId: string, runId: string }`
**Output:** `{ stopped: boolean }`

#### `explainNode`
Get a natural-language explanation of what a node does and what it outputs.
**Input:** `{ workflowId: string, nodeId: string }`
**Output:** `{ explanation: string }`

#### `compareRuns`
Compare two run results side by side.
**Input:** `{ workflowId: string, runIdA: string, runIdB: string, metrics?: string[] }`
**Output:** `{ comparison: ComparisonResult }`

#### `generateWorkflow`
Generate a complete workflow from a natural-language goal description. Returns a `WorkflowSchema` the canvas hydrates.
**Input:** `{ goal: string, domain?: string }`
**Output:** `{ workflow: WorkflowSchema }`

#### `listAgents`
List agents available to the current user for binding.
**Input:** `{ filter?: string, pageSize?: number }`
**Output:** `{ agents: { id, name, description }[] }`

---

## Accept / Reject Diff UX

When the Workflow Author Agent calls a tool that mutates the canvas (`addNode`, `removeNode`, `connect`, `disconnect`, `setNodeConfig`, `generateWorkflow`), the result is shown as a **pending diff** on the canvas:

- New nodes appear with a dashed blue border and a "Pending" badge
- Edges to be added are shown as dashed blue lines
- Nodes to be removed are shown with a red overlay and strikethrough label
- A floating diff bar appears above the canvas: `[Accept all]  [Reject all]  [Review 3 changes]`

The agent's message in the chat also summarizes the proposed change. The user can accept or reject individually by clicking each pending node/edge, or bulk-accept/reject.

This uses the **AI Collaborative Editing** Modus pattern.

---

## Chat UX

- **Trigger:** floating button in the bottom-right corner (Modus `ai-ux-floating-agent-chat` pattern)
- **Panel:** slide-over panel anchored to the right edge, 400px wide, full viewport height
- **Model selector:** `gemini-2.5-flash` (default) with a dropdown to switch — mirrors Studio's model picker
- **Conversation starters** shown when the chat is empty:
  - "Build a feature cost estimation workflow"
  - "Add a risk scorer for my current workflow"
  - "Run my workflow with 100 Monte Carlo iterations"
  - "Compare my last two runs"
- **Context awareness:** the agent always knows the active workflowId and mode (plan/execute) from the run context passed to the iframe

---

## Limitations and Constraints

- **Structural mutations only in Plan Mode:** the Workflow API MCP validates that `addNode`, `removeNode`, `connect`, `disconnect`, `setNodeConfig` are only accepted when the workflow is in Plan Mode. The agent is told this in its instructions and will explain it to the user if asked.
- **AgentCreator gating:** `addNode` for an AI node with `mode: "provisioned"` calls the Agent Service to create a new agent. If the user lacks `AgentCreator` role, this fails — the MCP returns an error and the agent explains the limitation and suggests binding an existing agent instead.
- **Workflow Author Agent is shared:** all users chat with the same agent but with different run contexts (different `workflowId`). There is no shared conversation history between users — each conversation thread is private to its creator.
