# Trimble Demo Data — MCP catalog (operator / n8n setup)

This file documents the **demo data catalog** and how to wire it to the `get_trimble_demo_data` MCP tool.  
Do **not** paste this into the AI Planner system prompt — the agent only needs [`SystemPromptMCP.md`](SystemPromptMCP.md).

---

## Data file

| Item | Path |
|------|------|
| Generated JSON | [`demo/trimble-demo-data.json`](../demo/trimble-demo-data.json) |
| Generator script | [`scripts/generate-trimble-demo-data.mjs`](../scripts/generate-trimble-demo-data.mjs) |

Regenerate:

```bash
node scripts/generate-trimble-demo-data.mjs
```

Commit only the JSON when updating demo values:

```bash
git add demo/trimble-demo-data.json
git commit -m "Update Trimble demo data catalog."
```

### Raw GitHub URL (for n8n GitHub node)

```
https://raw.githubusercontent.com/ElishaSamPeterPrabhu/AI-Dashboard/feature/mcp-apps-canvas/demo/trimble-demo-data.json
```

Adjust org/repo/branch if your fork differs.

---

## JSON schema

```json
{
  "version": "1.0",
  "generatedAt": "ISO-8601",
  "products": {
    "<product>": {
      "label": "Trimble Connect",
      "scenarios": {
        "<scenarioKey>": {
          "recordId": "<scenarioKey>",
          "label": "Human label",
          "fields": { "key": "value", "...": "..." }
        }
      }
    }
  }
}
```

### Trimble ecosystem — catalog products

Each row is a **separate data source** the agent can pull via `get_trimble_demo_data`. Names align with real Trimble lines (Connect CDE, Maps, Viewpoint/site, division org profiles, AgriData).

| Catalog `product` | Trimble product (demo alignment) | Scenario keys | One database node per… |
|-------------------|----------------------------------|---------------|------------------------|
| `connect` | **Trimble Connect** — projects, hours, budgets in the CDE | `flight_tracking_app`, `highway_expansion` | **Project** (each scenario = one Connect project record) |
| `maps` | **Trimble Maps** — routing / distance / commute | `delhi_commute`, `mumbai_local` | **Route / commute profile** |
| `rates` | **Trimble One** / regional labour benchmarks | `us_engineering_2026`, `in_engineering_2026` | **Rate card** (pick one region per node) |
| `site` | **Trimble Viewpoint** / field quantities | `site_block_3`, `warehouse_pad_2` | **Job site** |
| `org` | **Trimble division / org** — headcount & capacity | `civil_bengaluru`, `transport_delhi` | **Org** — use **one scenario per org** as its **own** `database` node |
| `agri` | **Trimble AgriData** | `wheat_punjab` | **Field / crop pilot** |

All `fields` values are **strings** so they map directly to `database` node `entries[].value`.

### Multi-org simulation — one workflow, separate databases

Typical demo: you talk about **Org A** (e.g. Civil Bengaluru), then **Org B** (e.g. Transportation Delhi), and optionally a **Connect project** owned by one of them. The agent should **not** merge orgs into one database node.

**Pattern:**

```
trigger
  ├→ database bengaluruOrg   ← get_trimble_demo_data(org, civil_bengaluru)
  ├→ database delhiOrg       ← get_trimble_demo_data(org, transport_delhi)
  └→ database connectProject   ← get_trimble_demo_data(connect, highway_expansion)  [optional]
        ↓ (each lane: calculator per org, or direct edges)
     connector mergeContext
        ↓
     calculator totalBlendedCost
        ↓
     ai → output
```

**Rules for combined org workflows:**

1. **One tool call → one `database` node** — never mix two orgs in one node.
2. **Unique entry keys** — org scenarios use prefixed keys (`blrTeamSize`, `delhiTeamSize`) so calculators can reference both without collision.
3. **Wire both org nodes** into a `connector` (or into one calculator with two incoming edges) before a blended total.
4. **Connect projects** include `owningOrg` / `owningOrgId` — use them in stickies or AI text to tie project ↔ org in the narrative.

**Example blended calculator** (after connector or dual-edge calc):

```text
blrTeamSize * blrAvgDailyRate + delhiTeamSize * delhiAvgDailyRate
```

**Example tool calls for a two-org capacity sim:**

| Step | Call |
|------|------|
| 1 | `{ product: "org", scenario: "civil_bengaluru", fields: ["orgName","blrTeamSize","blrAvgDailyRate","blrUtilizationPct"] }` |
| 2 | `{ product: "org", scenario: "transport_delhi", fields: ["orgName","delhiTeamSize","delhiAvgDailyRate","delhiUtilizationPct"] }` |
| 3 (optional) | `{ product: "connect", scenario: "highway_expansion", fields: ["projectName","estimatedHours","projectBudget","owningOrg"] }` |

Map each response to its own `database` node (`bengaluruOrg`, `delhiOrg`, `connectProject`) with `data.description` equal to the node id.

---

## n8n workflow

```
MCP Server Trigger  →  GitHub (Get File)  →  Code (filter)  →  Respond to MCP
```

### Tool: `get_trimble_demo_data`

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `product` | string | yes | `connect`, `maps`, `rates`, `site`, `org`, `agri` |
| `scenario` | string | no* | Scenario key, e.g. `delhi_commute` |
| `recordId` | string | no* | Alias for `scenario` |
| `fields` | string[] | no | Subset of field keys to return |

\*Required when the product has multiple scenarios.

### Code node (filter)

```javascript
const input = $input.first().json;
const { product, scenario, recordId, fields } = input;

const raw = $('GitHub').first().json;
// n8n may return content or base64 — decode as needed for your node version
const text = raw.content ?? Buffer.from(raw.contentBase64 ?? '', 'base64').toString('utf8');
const catalog = JSON.parse(text);

const prod = catalog.products?.[product];
if (!prod) {
  return { error: `Unknown product: ${product}`, available: Object.keys(catalog.products ?? {}) };
}

const key = recordId || scenario || Object.keys(prod.scenarios)[0];
const rec = prod.scenarios?.[key];
if (!rec) {
  return {
    error: `Unknown scenario: ${key}`,
    available: Object.keys(prod.scenarios ?? {}),
  };
}

let payload = { ...rec.fields };
if (Array.isArray(fields) && fields.length > 0) {
  payload = {};
  for (const f of fields) {
    if (f in rec.fields) payload[f] = rec.fields[f];
  }
}

return {
  ...payload,
  _meta: { product, scenario: key, label: rec.label },
};
```

### Agent Studio

1. Activate n8n workflow → copy MCP Server URL  
2. AI Planner agent → MCP Servers → add server (e.g. name `TrimbleDemo`)  
3. Confirm `get_trimble_demo_data` appears alongside AI Dashboard MCP tools  

---

## Example tool responses

**Flight app (subset):**

```json
{
  "frontendHours": "200",
  "backendHours": "300",
  "testingHours": "100",
  "hourlyRate": "75",
  "projectBudget": "72000",
  "_meta": { "product": "connect", "scenario": "flight_tracking_app", "label": "Flight Tracking App Plan" }
}
```

**Delhi commute (subset):**

```json
{
  "distanceKm": "28.4",
  "workingDaysPerMonth": "24",
  "busCostPerTrip": "15",
  "autoCostPerTrip": "55",
  "motorbikeFuelCostPerKm": "2.5",
  "carFuelCostPerKm": "6.67",
  "_meta": { "product": "maps", "scenario": "delhi_commute", "label": "India Gate → Cyber City commute" }
}
```

**Two-org sim — Bengaluru org (subset):**

```json
{
  "orgName": "Trimble Civil — Bengaluru",
  "blrTeamSize": "12",
  "blrAvgDailyRate": "750",
  "blrUtilizationPct": "82",
  "_meta": { "product": "org", "scenario": "civil_bengaluru", "label": "Trimble Civil — Bengaluru" }
}
```

**Two-org sim — Delhi org (subset):**

```json
{
  "orgName": "Transportation — Delhi NCR",
  "delhiTeamSize": "8",
  "delhiAvgDailyRate": "680",
  "delhiUtilizationPct": "88",
  "_meta": { "product": "org", "scenario": "transport_delhi", "label": "Transportation — Delhi NCR" }
}
```
