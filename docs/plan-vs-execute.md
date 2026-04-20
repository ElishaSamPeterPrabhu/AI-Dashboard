# Plan Mode vs Execute Mode

## Mode Toggle

A single Modus segmented control (`ModusWcButtonGroup`) lives in the top app bar, always visible. Two segments: **Plan** and **Execute**. Mode is persisted per workflow in `WorkflowSchema.defaultMode` and in `localStorage` for the active session.

```
[ Plan ]  [ Execute ]
```

The toggle is the highest-priority UI element — it controls everything else on the canvas.

---

## Plan Mode

### What it enables
- Full canvas editing: add/remove/move/connect/resize nodes
- Node config panels: click any node to edit its configuration
- AI node description editing: triggers re-provisioning or config update on save
- Chatbot canvas edits: the Workflow Author agent can add/modify/remove nodes
- Annotations: sticky notes, text blocks, frames can be placed freely

### What it locks
- No workflow execution
- No live data fetching from MCPs
- AI nodes show their bound agent chip but do not run

### Validation (runs continuously in Plan Mode)
The canvas lints the DAG in real time and surfaces issues without blocking editing:

| Validation | Visual indicator | Severity |
|---|---|---|
| Orphaned node (no edges) | Grey dashed border | Info |
| Missing required input port | Red port dot | Error |
| AI node not yet bound to an agent | Orange badge "Not configured" | Warning |
| Subagent chain depth > 3 hops | Red edge highlight + tooltip | Error |
| Cycle detected | Red edges in cycle + banner | Error |
| AI node description changed, agent config stale | Yellow badge "Needs sync" | Warning |
| MCP node with no connected AI node | Grey dashed border | Info |

Errors block the Execute toggle — the user must resolve them before switching. Warnings and Info do not block execution.

### Canvas UX in Plan Mode
- React Flow canvas: pan, zoom, select, multi-select, drag
- Node palette (left sidebar): all node types grouped by category; drag to canvas or double-click to place
- Edge creation: drag from an output port handle to an input port handle; type-incompatible connections are rejected with a Modus toast
- Right-click context menu on nodes: Edit config, Duplicate, Delete, Open agent in Studio (AI nodes only)
- Chatbot panel (bottom-right): floating `ModusAssistant` component; handles workflow CRUD commands

---

## Execute Mode

### What it enables
- Run the workflow simulation
- Step / pause / resume / cancel execution
- View live results on nodes
- Change Input node values and re-run (structural edits are locked)

### What it locks
- No node/edge additions or deletions
- No node repositioning
- Config panels are read-only (except Input node values)
- Chatbot can only `runWorkflow`, `stopWorkflow`, `explainNode`, `compareRuns` — no structural mutations

### Run Timeline (bottom bar)
A persistent bottom bar appears when Execute Mode is active:

```
[ ▶ Run ]  [ ⏸ Pause ]  [ ■ Stop ]    ○──●──○──○──○    ▾ Single  ▾ Monte Carlo (100)
                                       5/12 nodes done   Elapsed: 4.2s
```

- Progress dots: one per node in topological order; filled = done, pulsing = running, empty = pending
- Scenario selector: compare runs side-by-side (highlighted delta on Chart/Output nodes)
- Elapsed time
- Run history button → drawer listing past runs with input snapshots

### Monte Carlo Controls (Execute Mode overlay)
When one or more Assumption nodes are present, the Run button shows a secondary action:

```
[ ▶ Single Run ]  [ ▾ Monte Carlo: 100 iterations ]
```

Monte Carlo mode:
- "Preparing..." shimmer on all Assumption nodes while the Setup Agent generates samples
- Progress bar: `45 / 100 iterations complete`
- Chart nodes show distribution rendering as iterations complete
- After completion, Output nodes show `P10 / P50 / P90` instead of a single value

---

## AI Node Indicators (near the node, always visible)

These indicators live on the node body itself — not in a side panel — so they are always readable during execution without clicking anything.

### Status Badge (top-right of node)
```
● idle          grey pill
● provisioning  blue animated pulse ("Setting up agent…")
● ready         green checkmark + agent name chip
● running       blue pulse with spinner
● done          green checkmark
● error         red X
```

### Bound-Agent Chip (below node title)
Shows: agent avatar (16×16 WebP) + agent name + model label (`gemini-2.5-flash`).
Click → opens Trimble Agent Studio for this agent in a new tab.

### Token / Latency Meter (visible only while `running`)
Shows live values from AG UI metadata events:
```
⚡ 1,243 tok   ⏱ 3.1s
```
Collapses to nothing when the run ends.

### Tool-Call Ticker (visible only while `running`)
Inline list of tool names called so far:
```
[modus-docs] [datetime] [search_knowledge_base]
```
Each tool name is a pill. Clicking a tool pill highlights the corresponding MCP or Knowledge edge on the canvas.

### Confidence Band (below output value, if node outputs a confidence field)
A small horizontal bar showing optimistic–pessimistic range with the most-likely value marked. Uses the Modus Confidence Indicator pattern.

### Expandable Trace (collapsed by default)
A `ModusWcAccordion` at the bottom of the node:
```
▶ Reasoning trace   [312ms]
```
Expanded: shows the full AG UI event log — each message chunk, each tool call + result, final parsed output.

---

## Edge Animation During Execution

- **Inactive edges** (Plan Mode or unexecuted edges): static, Modus neutral color
- **Data flowing**: animated dashed stroke in Modus blue, flowing in direction of data travel
- **Tool call edge** (AI → MCP or AI → Knowledge): dotted animated stroke in Modus teal while the tool call is in flight
- **Completed edge**: solid stroke with a checkmark at the target end
- **Error edge**: red stroke

---

## On-Canvas Result Rendering

After a node completes:

- **Calculator / Process nodes**: output value appears in a small pill below the node
- **Output nodes**: value renders prominently inside the node card
- **Chart nodes**: chart renders inline within the node body (expands to fill the node's size)
- **AI nodes**: output values appear as labeled pills per output port; the expandable trace becomes available

In Monte Carlo mode, all numeric outputs show `P10 / P50 / P90` as a three-value pill instead of a single value.

---

## Mode Switch Guard

If the user attempts to switch from Plan Mode to Execute Mode while errors exist:
- The toggle animates back to Plan
- A Modus toast lists the blocking errors with links to the affected nodes

If the user attempts to switch from Execute Mode to Plan Mode while a run is in progress:
- A `ModusWcModal` confirmation: "Stop the running simulation and switch to Plan Mode?"
- Confirming cancels the run and re-enables canvas editing
