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

### Products and scenarios

| product | scenario keys | Typical use |
|---------|---------------|-------------|
| `connect` | `flight_tracking_app`, `highway_expansion` | Project hours, budget, team |
| `maps` | `delhi_commute`, `mumbai_local` | Distance, commute costs |
| `rates` | `us_engineering_2026`, `in_engineering_2026` | Daily rate cards |
| `site` | `site_block_3`, `warehouse_pad_2` | Site area, material/labor $/m² |
| `org` | `civil_bengaluru`, `transport_delhi` | Headcount, utilization |
| `agri` | `wheat_punjab` | Field area, yield, costs |

All `fields` values are **strings** so they map directly to `database` node `entries[].value`.

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
