# Run Context and Input Nodes

## What Is Run Context

The Trimble Agent Service supports a "run context" — a flat array of `{ description, value }` string pairs that travels alongside every agent invocation. The agent can read it via the `get_run_context` virtual tool, and it is available for variable substitution in MCP headers and Knowledge Library connection strings.

This is the exact mechanism AI Dashboard uses to pass Input and Assumption node values into agent runs.

---

## How Input Nodes Serialize to Run Context

Every Input and Assumption node produces exactly one `RunContextEntry`:

```typescript
interface RunContextEntry {
  description: string;  // unique within the workflow — used as the substitution key
  value: string;        // always a string; numbers and objects are JSON-stringified
}
```

The `description` field on an Input node config is **the run context key**. It must be unique across all Input and Assumption nodes in the workflow. The canvas validator enforces uniqueness and shows an error if two nodes share the same description.

**Example workflow:**
```
Input node "Team Size"           → description: "teamSize",           value: "5"
Input node "Velocity (SP/week)"  → description: "velocityPerWeek",    value: "32"
Assumption node "Weather Delay"  → description: "weatherDelayDays",   value: "2.4"  (sampled)
```

Produces this run context array for each agent invocation:
```json
[
  { "description": "teamSize",         "value": "5" },
  { "description": "velocityPerWeek",  "value": "32" },
  { "description": "weatherDelayDays", "value": "2.4" }
]
```

---

## Variable Substitution in Agent Configurations

Once run context is set, agents can reference it in two places:

### 1. MCP Tool Headers

When an MCP Data node is connected to an AI node, the MCP tool's headers can contain substitution variables:

```json
{
  "headers": {
    "X-Project-Id": "{run.context.projectId}",
    "Authorization": "Bearer {actorToken?scopes=openid connect}"
  }
}
```

This means the AI node can pass the current user's Trimble Connect project ID (sourced from an Input node) directly into the MCP call header — without any custom plumbing.

### 2. Knowledge Library Connection String Filters

When a Knowledge node is connected to an AI node, the KB connection string can reference run context for dynamic filtering:

```
https://kb.trimble.com/v1/search?libraries=libId&searchType=semantic&filter=category==(project:{run.context.projectCategory})
```

This lets the same AI node answer different questions depending on the project category the user selected.

---

## Supported Substitution Tokens

| Token | What it resolves to | Where it works |
|---|---|---|
| `{run.context.<description>}` | Value of the matching run context entry | MCP headers, KB connection strings |
| `{actorToken?scopes=<scopes>}` | On-behalf TID token for the user making the run request | MCP headers only |
| `{agentToken?scopes=<scopes>}` | Agent's own service token (client credentials) | MCP headers only |
| `{actorRawToken}` | Raw TID token (not recommended — may expire mid-run) | MCP headers only |
| `{chat_history}` | Full conversation history (respects agent's short-memory setting) | KB query rewrite prompt only |
| `{question}` | Most recent message in the thread | KB query rewrite prompt only |

**Note:** `{run.context.*}` is **not supported** in the agent's system prompt for security and caching reasons. The agent receives context as a `get_run_context` tool result instead.

---

## How the Simulation Engine Collects Run Context

The simulation engine walks the DAG in topological order and collects all resolved Input/Assumption node outputs before starting any agent runs:

```typescript
function collectRunContext(nodes: NodeState[], resolvedValues: Map<string, unknown>): RunContextEntry[] {
  return nodes
    .filter(n => n.type === "input" || n.type === "assumption")
    .map(n => ({
      description: n.config.description,
      value: String(resolvedValues.get(n.id) ?? n.config.defaultValue ?? "")
    }));
}
```

This collected context is passed to every AI node's run creation call, regardless of which Input nodes are directly connected to it. This is intentional: the run context is a workflow-wide namespace, not a per-node namespace.

**Why workflow-wide?** An AI node may need to read an assumption value (e.g. `weatherDelayDays`) that isn't directly connected to it but was set elsewhere in the workflow. Variable substitution in MCP headers needs the full context to work.

---

## Monte Carlo Sampling

When one or more Assumption nodes have distribution configs, the engine runs N iterations with different sampled values:

1. The Monte Carlo Setup Agent receives all Assumption node configs and `iterations: N`
2. It generates N sample sets: each is a complete `RunContextEntry[]` with sampled values for all Assumption nodes and fixed values for all Input nodes
3. Each iteration runs the full workflow with its own sample set
4. After all iterations complete, output values are aggregated per node: `{ mean, p10, p50, p90, stdDev }`

Each Assumption node's output value in a given iteration is the sampled value from that iteration's sample set. Chart nodes render the aggregate distributions.

---

## Context Naming Conventions

To avoid description key collisions and make variable substitution readable, follow these naming conventions for Input/Assumption nodes:

- Use camelCase: `teamSize` not `team size`
- Be specific: `projectBudgetUSD` not `budget`
- For Trimble domain values: prefix with the source: `connectProjectId`, `viewpointContractId`
- For date inputs: include units: `projectStartDate`, `reportingPeriodDays`
- For ranges/distributions: include the metric: `weatherDelayDaysPerMonth`

The dashboard enforces uniqueness but not naming conventions — conventions are a team agreement.
