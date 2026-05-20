# AI Dashboard — Demo Context

Use this document to get up to speed on what was built before preparing demo talking points or slides.

---

## What is this project?

An AI-powered workflow canvas that lets users design, execute, and visualise multi-step analytical workflows through natural language. It integrates with **Trimble Agentic Studio** and is accessible via **Trimble Assist** as an MCP (Model Context Protocol) server.

---

## Live URLs

| Component | URL |
|-----------|-----|
| React UI (Amplify) | https://feature-mcp-apps-canvas.d144x4qv8kv4uy.amplifyapp.com |
| BFF/MCP via CloudFront (HTTPS) | https://dgtwvcgqb2qyi.cloudfront.net |
| BFF/MCP direct (HTTP) | http://Ai-dashboard-prod.eba-qpt2x3g2.us-east-1.elasticbeanstalk.com |
| MCP endpoint (Assist) | https://dgtwvcgqb2qyi.cloudfront.net/mcp |

---

## Architecture

```
Trimble Assist (chat UI)
    │
    ├─ AI Planner agent (Studio: df7b36b9-...)
    │       System prompt: server/SystemPromptMCP.md
    │       Calls MCP tools directly to build the graph
    │
    └─ AI Dashboard MCP server (https://dgtwvcgqb2qyi.cloudfront.net/mcp)
            │
            ├─ create_workflow    → creates canvas in BFF store
            ├─ add_node           → appends a node
            ├─ connect_nodes      → adds an edge
            ├─ execute_workflow   → runs the graph, calls AI nodes
            ├─ get_canvas         → reads current nodes/edges (for editing)
            └─ update_node        → patches node data (value, formula)
                    │
                    ▼
            React Flow canvas (Amplify UI)
            Renders workflow with execution results inline in Assist (MCP App)
```

The demo page (`/demo`) also works standalone via `POST /api/demo/run` (BFF calls the same Studio agent, agent returns JSON envelope, BFF builds the graph and executes it).

---

## Node types on the canvas

| Type | Purpose | Key data fields |
|------|---------|-----------------|
| trigger | Start node — required for execution | label |
| input | User-provided value | label, value, description=id |
| database | Lookup table / rate card | label, entries=[{key,value}], description=id |
| calculator | Arithmetic formula | label, formula (uses node ids as variables) |
| assumption | Triangular/uniform range estimate | label, min, max, mostLikely |
| chart | Bar/pie visualisation | label, chartType, chartKeys |
| connector | Merge point for parallel lanes | label |
| output | Final result display | label |
| ai | Agent-generated narrative (optional) | label, description (system prompt ≤120 chars) |

**Critical rule:** `input` and `database` nodes must have `data.description` equal to their `id` — the executor uses this as the formula variable name.

---

## How the Assist demo works

1. User sends a message in Trimble Assist (using the AI Planner agent).
2. The agent interprets the request and calls MCP tools sequentially:
   - `create_workflow` → gets `workflowId`
   - `add_node` × N (each call <10ms)
   - `connect_nodes` × M
   - `execute_workflow` → runs calculators, optionally calls AI nodes
3. The MCP server (BFF on EB behind CloudFront) stores the graph in memory.
4. Assist renders the workflow canvas inline via the **MCP App** (Dashboard-MCP panel).
   - The canvas iframe loads from Amplify at `…/projects/p1/workflows/{workflowId}?embed=1`
5. The agent replies in plain text with key results and the canvas URL.

**Edit flow:** agent calls `get_canvas(workflowId)` → reads node ids → calls `update_node(workflowId, nodeId, {value: X})` → `execute_workflow` to re-run.

---

## Key fixes shipped

- **Formula context keys**: node `id` (camelCase) is used as the variable name in formulas, not the label (which was incorrectly snake_cased).
- **Trigger-reachability**: only nodes connected (directly or indirectly) to a `trigger` node execute. Disconnected nodes are skipped.
- **Output node receives upstream**: output nodes now pull the last upstream value (AI text, calculator result) so results propagate to the final node.
- **AI node fallback result**: when the agent runs script tool calls but produces no text, the last tool call result is used as `_result`.
- **HTTPS end-to-end**: CloudFront in front of EB fixes mixed-content blocks from Amplify/Assist (all over HTTPS now).
- **MCP App fallback**: when Assist doesn't send `ui/initialize`, the BFF embeds the latest `workflowId` directly in the HTML so the canvas auto-loads after 1.5s.

---

## Agent Studio config

| Agent | UUID | Role |
|-------|------|------|
| AI Planner (orchestrator) | df7b36b9-328a-41a5-8cd8-73d80c37ac46 | Main chat agent in Assist; calls MCP tools |
| Workflow Builder (sub-agent, optional) | 61cbe03d-2d75-47af-89b5-bf9bb455f905 | Not used in current Assist flow; kept for demo page |

**Studio system prompt** is in [`server/SystemPromptMCP.md`](server/SystemPromptMCP.md).  
Key instruction: "Mode A — Trimble Assist (MCP tools available)" — agent builds graph by calling tools directly (not using `build_workflow`).

---

## AWS infrastructure

| Service | Purpose | Details |
|---------|---------|---------|
| Elastic Beanstalk | NestJS BFF | `Ai-dashboard-prod`, us-east-1, t2.micro (free tier) |
| CloudFront | HTTPS in front of EB | `dgtwvcgqb2qyi.cloudfront.net`, CachingDisabled |
| Amplify | React UI hosting | Branch `feature/mcp-apps-canvas`, auto-builds on push |

**EB env vars needed:** `BFF_PUBLIC_URL`, `UI_PUBLIC_URL`, `TRIMBLE_AGENT_BASE_URL`, `DEMO_PLANNER_AGENT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `NODE_ENV=production`, `PORT=8080`.

**Token refresh:** uses `CLIENT_ID`/`CLIENT_SECRET` for a machine token (auto-refreshes every 45 min). If expired, patch via:
```bash
curl -X PATCH https://dgtwvcgqb2qyi.cloudfront.net/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"token": "<fresh JWT>"}'
```

---

## Repo

- **GitHub:** https://github.com/ElishaSamPeterPrabhu/AI-Dashboard
- **Active branch:** `feature/mcp-apps-canvas`
- **Default branch:** `master` (merge here after demo)

### Key files

| File | Purpose |
|------|---------|
| `server/src/planner/planner.service.ts` | MCP tool registry + handlers |
| `server/src/planner/mcp-standalone.controller.ts` | `/mcp` Streamable HTTP endpoint |
| `server/src/planner/workflow-graph.ts` | Topological execution, context assembly |
| `server/src/planner/demo-run.service.ts` | `/api/demo/run` agent loop |
| `server/SystemPromptMCP.md` | Agent system prompt for Assist |
| `src/store/canvasStore.ts` | Frontend execution engine |
| `src/utils/workflowContext.ts` | Frontend context assembly |
| `src/pages/CanvasPage.tsx` | Canvas editor UI |
| `aws/README.md` | Full AWS deployment steps |
| `scripts/bundle-eb.sh` | Build EB zip: `npm run bundle:eb` |

---

## Demo script (suggested)

1. Open Trimble Assist Stage → AI Planner agent
2. Prompt: *"Plan a sprint for a team of 8, velocity 42, daily rate $200, 10-day sprint. Include a bar chart of points, cost, and cost per point."*
3. Assist calls MCP tools (visible in "Show Thinking") → canvas appears in Dashboard-MCP panel
4. Canvas shows nodes with green ✓ and computed results
5. Follow up: *"Now change the team size to 10"* → agent calls `get_canvas` + `update_node` + `execute_workflow`

**Health check before demo:**
```bash
curl https://dgtwvcgqb2qyi.cloudfront.net/api/health
# expect: {"ok":true,"agentKeySet":true,"agentKeyExpiry":"..."}
```
