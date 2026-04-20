# Node Catalog — v1

All v1 nodes must implement the `NodeDefinition` interface from `architecture.md`. This document specifies the config, input, output, and visual design for each node type.

---

## Canvas Primitives (non-executing)

### Idea / Sticky
- **Type key:** `idea`
- **Version:** 1
- **Description:** A free-form text note. Inspired by Miro sticky notes. No inputs or outputs, no execution.
- **Config:** `{ text: string; color: "yellow" | "blue" | "pink" | "green" | "purple" }`
- **Execute:** no-op
- **Visual:** colored card, resizable, supports inline edit, drag to reposition

### Text Block
- **Type key:** `text`
- **Version:** 1
- **Description:** Rich-text annotation for labeling areas of the canvas.
- **Config:** `{ content: string; fontSize: "sm" | "md" | "lg" }`
- **Execute:** no-op

### Group / Frame
- **Type key:** `group`
- **Version:** 1
- **Description:** Container that groups other nodes visually. Labeled. Supports collapse.
- **Config:** `{ label: string; collapsed: boolean }`
- **Execute:** no-op

---

## Workflow Primitives (executing)

### Process / Action
- **Type key:** `process`
- **Version:** 1
- **Description:** A named step in the workflow. Documents what happens at this stage.
- **Config:** `{ label: string; description?: string; owner?: string }`
- **Inputs:** any (pass-through)
- **Outputs:** same as inputs (identity passthrough)
- **Execute:** immediately emits inputs as outputs. Used as visual documentation and to anchor AI nodes.

### Decision
- **Type key:** `decision`
- **Version:** 1
- **Description:** A diamond branch node. Routes flow to one of N output ports based on a condition.
- **Config:**
  ```typescript
  {
    condition: string;   // JS expression evaluated in Calculator sandbox
    branches: { label: string; portId: string }[];
  }
  ```
- **Inputs:** `{ value: unknown }` + any upstream context
- **Outputs:** one per branch, all typed `unknown`
- **Execute:** evaluates `condition` in QuickJS sandbox; emits on the matching branch port only

### Loop Frame
- **Type key:** `loop`
- **Version:** 1
- **Description:** A container node that repeats its child workflow for each item in an array input.
- **Config:** `{ iterationLabel: string; maxIterations: number }`
- **Inputs:** `{ items: unknown[] }`
- **Outputs:** `{ results: unknown[] }` (collected from each iteration)
- **Constraint:** AI nodes inside a Loop Frame may not themselves have AI node subagent dependencies — to avoid stacking subagent depth

---

## Input / Assumption Nodes

### Input
- **Type key:** `input`
- **Version:** 1
- **Description:** A named scalar value supplied by the user. Becomes a run context entry.
- **Config:**
  ```typescript
  {
    label: string;
    description: string;   // used as RunContextEntry.description — must be unique in workflow
    dataType: "string" | "number" | "boolean" | "object";
    defaultValue?: unknown;
    required: boolean;
  }
  ```
- **Inputs:** none
- **Outputs:** `{ value: <dataType> }`
- **Run context serialization:** `{ description: config.description, value: String(value) }`

### Assumption (Distribution)
- **Type key:** `assumption`
- **Version:** 1
- **Description:** A named value configured as a probability distribution for Monte Carlo simulation. In single-shot runs, `mostLikely` is used.
- **Config:**
  ```typescript
  {
    label: string;
    description: string;   // run context key
    distribution: "triangular" | "uniform" | "normal";
    min: number;
    max: number;
    mostLikely?: number;   // triangular only
    mean?: number;         // normal only
    stdDev?: number;       // normal only
  }
  ```
- **Outputs:** `{ value: number }`
- **Monte Carlo behavior:** the simulation engine samples this distribution N times and produces N run context entries

---

## AI Node

### AI
- **Type key:** `ai`
- **Version:** 1
- **Description:** An AI node backed by a Trimble Agent. The core value-add node of the canvas.
- **Config:**
  ```typescript
  {
    label: string;
    description: string;         // user-authored; hashed to detect staleness
    descriptionHash: string;     // SHA-256 of description; compared on each run
    agentBinding: AgentBinding;  // see architecture.md
    outputSchema: OutputPortSchema[];  // expected output ports
    quotaWarningThreshold: number;     // 0–1; show warning when usage > threshold
  }
  ```
- **Inputs:** one per incoming edge's source port — all collected and serialized to run context
- **Outputs:** parsed from agent run's final message according to `outputSchema`; fallback to `{ text: string }` if parsing fails
- **Execute:**
  1. Collect all resolved input values
  2. Serialize to `RunContext[]` (description = port label, value = stringified value)
  3. `POST /threads` on Agent Service (creates a thread for this run)
  4. `POST /threads/{id}/runs` with run context → receives SSE stream
  5. Forward AG UI events as `node:progress`, `tool:call`, `tool:result` events to WebSocket
  6. On `RUN_FINISHED`, parse final message against `outputSchema`, emit `node:value`
  7. Emit `node:end`
- **Visual:**
  - AI gradient border (from `AiUxGradientFrame`)
  - Status badge: `idle | provisioning | ready | running | done | error`
  - Bound-agent chip (avatar + name) — click to open in Trimble Agent Studio
  - Token / latency meter while running (from AG UI metadata events)
  - Tool-call ticker (list of tool names called during run)
  - Expandable trace (full AG UI event log)

---

## Data Nodes

### MCP Data
- **Type key:** `mcp`
- **Version:** 1
- **Description:** Calls a specific tool on a registered MCP server. Returns structured data for downstream nodes.
- **Config:**
  ```typescript
  {
    label: string;
    mcpServerUrl: string;
    toolName: string;
    toolInputSchema: object;     // JSON Schema for the tool's input params
    toolOutputSchema: object;    // JSON Schema for the tool's output
    authMode: "actorToken" | "agentToken";
    tokenScopes?: string;        // e.g. "openid connect"
    timeoutSeconds: number;      // default 900 (15 min)
  }
  ```
- **Inputs:** one per param in `toolInputSchema`
- **Outputs:** one per field in `toolOutputSchema`
- **Note:** In Execute Mode, MCP Data nodes are also auto-registered as agent tools on any AI node they connect to. The AI node's bound agent calls the MCP through the Agent Service, not through the dashboard backend.

### Knowledge
- **Type key:** `knowledge`
- **Version:** 1
- **Description:** References a Trimble Knowledge Library. Connects to an AI node to enable RAG.
- **Config:**
  ```typescript
  {
    label: string;
    libraryId: string;
    libraryName: string;         // display only
    retrievalConfig?: {
      queryRewritePrompt?: string;
      connectionStringFilter?: string;   // supports {run.context.<desc>} substitution
    }
  }
  ```
- **Inputs:** none
- **Outputs:** none (connects only to AI nodes via a special "knowledge" edge type)
- **Execute:** no-op — the knowledge library is attached to the bound agent's config; the agent invokes `search_knowledge_base` internally

### Calculator
- **Type key:** `calculator`
- **Version:** 1
- **Description:** Deterministic formula node. Runs a user-authored JS expression in the QuickJS sandbox. No LLM involved.
- **Config:**
  ```typescript
  {
    label: string;
    formula: string;    // JS expression, receives input port names as variables
    outputPorts: { name: string; type: "number" | "string" | "boolean" }[];
  }
  ```
- **Inputs:** one per variable referenced in `formula`
- **Outputs:** per `outputPorts`
- **Execute:** evaluates `formula` in QuickJS; emits outputs immediately; no async, no network

---

## Output / Visualization Nodes

### Chart
- **Type key:** `chart`
- **Version:** 1
- **Description:** Renders upstream numeric data as a chart inline on the canvas.
- **Config:**
  ```typescript
  {
    label: string;
    chartType: "bar" | "line" | "area" | "scatter" | "distribution";
    xAxisLabel?: string;
    yAxisLabel?: string;
    colorScheme?: "modus-default" | "modus-categorical";
  }
  ```
- **Inputs:** `{ data: number[] | { x: unknown; y: number }[] | ChartSeries[] }`
- **Outputs:** none
- **Execute:** stores received data; re-renders via Recharts on `node:value`

### Output / Result Card
- **Type key:** `output`
- **Version:** 1
- **Description:** Displays a labeled scalar or text result prominently on the canvas.
- **Config:** `{ label: string; format: "number" | "currency" | "percentage" | "text" | "date" }`
- **Inputs:** `{ value: unknown }`
- **Outputs:** none
- **Execute:** stores value; renders formatted using Modus `ModusWcTypography`

---

## Node Versioning and Migration

When `nodeVersion` in a saved workflow differs from the current `NodeDefinition.version`:

1. The loader checks for a registered migration function `migrate_<type>_v<old>_to_v<new>`
2. If found, it applies the migration to `config` before hydrating the node
3. If no migration exists, the node renders in a "degraded" state with a warning badge

Migration functions are co-located with the node definition file.
