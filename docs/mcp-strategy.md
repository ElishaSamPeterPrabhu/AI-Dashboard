# MCP Strategy

## How MCP Nodes Work on the Canvas

An MCP Data node on the canvas represents a single tool call on a specific MCP server. It is **not** a connection to an entire MCP server — it is one tool from one server, with a concrete input/output schema.

When the user connects an MCP Data node to an AI node:
- The MCP tool is added to the AI node's bound agent's configuration via `PATCH /v1/agents/{agentId}/configs`
- The agent decides at runtime when to call the tool (based on its instructions and the user's prompt)
- Tool call events stream back via AG UI and animate the edge between the AI node and the MCP node on the canvas

---

## Transport and Authentication

All Trimble MCPs use the **HTTP streamable transport** specified by the MCP protocol, with TID authentication:

```
POST {mcpServerUrl}/mcp
Authorization: Bearer {actorToken?scopes=openid <product-scope>}
Content-Type: application/json

{ "jsonrpc": "2.0", "method": "tools/call", "params": { "name": "...", "arguments": {...} } }
```

The `{actorToken?scopes=...}` substitution in the MCP tool header means the call is made on behalf of the user who triggered the workflow run — the user's own Trimble permissions control what data the MCP returns.

Agent token (`{agentToken?scopes=...}`) is available for machine-to-machine scenarios (e.g. a nightly simulation run) but most dashboard MCPs should use actor token for data access control.

Default timeout: 900 seconds (15 minutes). Configurable per MCP node in the config panel.

---

## MCP Node → Agent Tool Mapping

When an MCP Data node is connected to an AI node, the dashboard constructs this tool spec in the agent config:

```json
{
  "type": "mcp",
  "name": "{mcpNodeLabel}",
  "mcpServerUrl": "{config.mcpServerUrl}",
  "description": "{config.toolDescription}",
  "auth": {
    "type": "actorToken",
    "scopes": "{config.tokenScopes}"
  },
  "timeoutSeconds": 900,
  "headers": {
    "X-Run-Context": "{run.context.projectId}"   // example; configured per node
  }
}
```

Disconnecting the MCP node from the AI node removes the tool from the agent config in the next PATCH.

---

## Test MCP — Specification

The Test MCP is a Fastify server deployed alongside the dashboard backend. It speaks the same HTTP streamable + TID transport as real Trimble MCPs so the entire wiring stack is exercised identically.

**Base URL:** `http://localhost:3001/mcp` (dev) / `https://test-mcp.dashboard.ai.trimble.com/mcp` (staging)

**Auth:** TID bearer token (same as Agent Service). The Test MCP validates the token signature but does not enforce product-specific scopes — any valid TID token is accepted.

### Tools provided

#### `get_project_summary`
Returns a fake Trimble Connect project summary.

**Input schema:**
```json
{ "projectId": "string" }
```

**Output:**
```json
{
  "id": "string",
  "name": "string",
  "status": "active | at_risk | delayed",
  "scheduleVarianceDays": "number",
  "budgetVariancePct": "number",
  "openIssues": "number",
  "lastUpdated": "string (ISO 8601)"
}
```

#### `get_labor_rates`
Returns fake labor rates by role and region.

**Input:**
```json
{ "region": "string", "roles": ["string"] }
```

**Output:**
```json
{
  "rates": [
    { "role": "string", "ratePerHour": "number", "currency": "string" }
  ]
}
```

#### `get_weather_history`
Returns fake historical weather data for Monte Carlo inputs.

**Input:**
```json
{ "location": "string", "months": "number" }
```

**Output:**
```json
{
  "averageDelayDaysPerMonth": "number",
  "worstCaseDelayDays": "number",
  "bestCaseDelayDays": "number",
  "historicalData": [{ "month": "string", "delayDays": "number" }]
}
```

#### `get_headcount_availability`
Returns fake team headcount and availability.

**Input:**
```json
{ "teamId": "string", "startDate": "string", "endDate": "string" }
```

**Output:**
```json
{
  "team": [
    { "name": "string", "role": "string", "availabilityPct": "number" }
  ],
  "totalFTE": "number"
}
```

#### `get_cost_estimate_benchmarks`
Returns fake industry cost benchmarks by category.

**Input:**
```json
{ "category": "string", "region": "string" }
```

**Output:**
```json
{
  "lowPct10": "number",
  "mid": "number",
  "highPct90": "number",
  "unit": "string",
  "currency": "string"
}
```

---

## Trimble Division MCPs (Roadmap)

Each division MCP will register as a set of MCP node templates in the node palette under a "Trimble Connected Data" group. Users drag a template to get a pre-configured MCP node with the correct server URL, auth scope, and input/output schema.

| Division | MCP | Status | Contact needed |
|---|---|---|---|
| Trimble Connect | `connect-mcp` | Not started | Connect team |
| Trimble Viewpoint | `viewpoint-mcp` | Not started | Viewpoint team |
| Trimble Construction One | `tco-mcp` | Not started | TCO team |
| Tekla Structures | `tekla-mcp` | Not started | Tekla team |
| SketchUp | `sketchup-mcp` | Not started | SketchUp team |
| Trimble Maps | `maps-mcp` | Not started | Maps team |
| Trimble Agriculture | `agri-mcp` | Not started | Agri team |
| Trimble Geospatial | `geo-mcp` | Not started | Geo team |

Until a real division MCP is available, the Test MCP provides a drop-in replacement with matching tool names.

---

## MCP Node Palette UX

The left sidebar node palette shows MCP nodes grouped by:

1. **Trimble Built-Ins** — virtual tools from the Agent Service (`datetime`, `myprofile`, `user_directory`, `trimble_help`, `tekla_help`, `web_search`). Dragging one onto an AI node enables that built-in tool on the agent — no MCP node needed, no edge drawn.

2. **Trimble Connected Data** — pre-configured templates for registered division MCPs. Dragging creates an MCP node pre-filled with the server URL, tool name, and schemas.

3. **Custom MCP** — blank MCP node the user fills in manually (server URL, tool name, schemas). For power users connecting non-Trimble MCPs.

---

## Data Consent and Safety

Before a workflow that connects to a real Trimble MCP (not the Test MCP) is executed for the first time, the canvas surfaces the Modus **AI Data Consent** pattern:

```
[ Modal ]
This workflow will send data to Trimble Connect on your behalf.
Data sent: projectId (from Input node "Project ID")

Your existing Trimble Connect permissions apply.
By running this workflow you agree to Trimble's AI data processing terms.

[ Cancel ]  [ I understand, run workflow ]
```

This consent is stored per `(userId, workflowId, mcpServerUrl)` tuple so it only shows once per unique combination.
