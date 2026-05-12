#!/usr/bin/env node
/**
 * AI Planner — MCP App demo script.
 *
 * Simulates what a Trimble agent in Studio/Assist would do when given a planning request:
 *   1. Discover available tools (tools/list)
 *   2. Create a workflow for "Sprint Capacity Planning"
 *   3. Build the graph: trigger → inputs → calculator → connector (pass-through) → AI → outputs
 *   4. Execute server-side (topological order, live agent calls)
 *   5. Print the final canvas state so you can open it in the UI
 *
 * Uses two of your existing agents:
 *   - Modus Agent  (general-purpose → used as the AI analysis node)
 *   - Risk Estimator (used as the Connector enrichment agent)
 *
 * Usage:
 *   npm run test:planner
 *   API_BASE=http://127.0.0.1:3000/api npm run test:planner
 */

const BASE = (process.env.API_BASE ?? "http://127.0.0.1:3000/api").replace(/\/$/, "");
const MCP  = `${BASE}/planner/mcp`;

async function rpc(id, method, params) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`[${method}] ${JSON.stringify(j.error)}`);
  return j.result;
}

async function callTool(id, name, args) {
  const r = await rpc(id, "tools/call", { name, arguments: args });
  if (r.isError) {
    const msg = r.content?.[0]?.text ?? "";
    throw new Error(`[${name}] ${msg}`);
  }
  const text = r.content?.[0]?.text;
  return text ? JSON.parse(text) : r;
}

function sep(label) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("─".repeat(60));
}

async function main() {
  sep("1 · Discover available agents");
  const agents = await fetch(`${BASE}/agents`).then(r => r.json());
  const modusAgent   = agents.find(a => a.name === "Modus Agent")    ?? agents[0];
  const riskAgent    = agents.find(a => a.name === "Risk Estimator")  ?? agents[0];
  console.log("Planning agent (AI node)  :", modusAgent.name,  modusAgent.id);
  console.log("Enrichment agent (Connector):", riskAgent.name, riskAgent.id);

  sep("2 · Initialize MCP session (like a Trimble agent would)");
  const init = await rpc(0, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "AI-Planner-MCP-App" },
  });
  console.log("server:", init.serverInfo.name, init.serverInfo.version);

  sep("3 · Discover tools (tools/list)");
  const { tools } = await rpc(1, "tools/list", {});
  tools.forEach(t => console.log(" •", t.name, "—", t.description.slice(0, 70)));

  sep("4 · Create workflow: Sprint Capacity Planning");
  const { workflowId } = await callTool(2, "create_workflow", {
    projectId: "p1",
    name: "Sprint Capacity Planning (AI-built)",
    description: "Built programmatically via the AI Planner MCP App",
  });
  console.log("workflowId:", workflowId);
  console.log("UI URL    :", `http://localhost:5173/projects/p1/workflows/${workflowId}`);

  sep("5 · Add nodes (agent assembles the graph)");
  const nodes = [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 40, y: 100 },
      data: { label: "Start", triggerType: "manual" },
    },
    {
      id: "in-team",
      type: "input",
      position: { x: 220, y: 40 },
      data: { label: "Team Size", value: "8", description: "team_size" },
    },
    {
      id: "in-velocity",
      type: "input",
      position: { x: 220, y: 150 },
      data: { label: "Sprint Velocity", value: "42", description: "velocity" },
    },
    {
      id: "in-rate",
      type: "database",
      position: { x: 220, y: 260 },
      data: {
        label: "Rate Table",
        entries: [
          { key: "dailyRate",   value: "800"  },
          { key: "sprintDays",  value: "10"   },
        ],
      },
    },
    {
      id: "calc-capacity",
      type: "calculator",
      position: { x: 420, y: 130 },
      data: {
        label: "Sprint Cost",
        formula: "team_size * sprintDays * dailyRate",
      },
    },
    {
      id: "connector-1",
      type: "connector",
      position: { x: 600, y: 130 },
      data: {
        label: "Phase Gate",
        sectionName: "Risk & Feasibility",
        description:
          "Summarise sprint cost inputs for downstream risk AI node. " +
          "Return JSON with keys: capacity_summary (string).",
        agentId: riskAgent.id,
        agentName: riskAgent.name,
      },
    },
    {
      id: "ai-plan",
      type: "ai",
      position: { x: 780, y: 130 },
      data: {
        label: "Capacity Planner AI",
        description:
          "Given team_size, velocity, sprintDays, dailyRate, and sprint cost, " +
          "assess sprint feasibility and recommend actions. " +
          "Return JSON: { feasibility_score (0-100), recommendation (string), adjusted_capacity (number) }.",
        agentId: modusAgent.id,
        agentName: modusAgent.name,
      },
    },
    {
      id: "out-score",
      type: "output",
      position: { x: 960, y: 80 },
      data: { label: "Feasibility Score", description: "feasibility_score" },
    },
    {
      id: "out-rec",
      type: "output",
      position: { x: 960, y: 200 },
      data: { label: "Recommendation", description: "recommendation" },
    },
  ];

  let nodeSeq = 3;
  for (const n of nodes) {
    const r = await callTool(nodeSeq++, "add_node", { workflowId, node: n });
    console.log(" added", n.type.padEnd(10), n.id, "→ nodeCount:", r.nodeCount);
  }

  sep("6 · Connect nodes (agent wires the graph)");
  const edges = [
    ["trigger-1",    "in-team"],
    ["trigger-1",    "in-velocity"],
    ["trigger-1",    "in-rate"],
    ["in-team",      "calc-capacity"],
    ["in-velocity",  "calc-capacity"],
    ["in-rate",      "calc-capacity"],
    ["calc-capacity","connector-1"],
    ["in-team",      "connector-1"],
    ["connector-1",  "ai-plan"],
    ["ai-plan",      "out-score"],
    ["ai-plan",      "out-rec"],
  ];

  let edgeSeq = nodeSeq;
  for (const [src, tgt] of edges) {
    const r = await callTool(edgeSeq++, "connect_nodes", { workflowId, source: src, target: tgt });
    console.log(" edge", `${src} → ${tgt}`.padEnd(38), "edgeCount:", r.edgeCount);
  }

  sep("7 · Execute workflow server-side (topological, live agents)");
  console.log("calling execute_workflow… (may take 15-30s for AI nodes)");
  const exec = await callTool(edgeSeq, "execute_workflow", { workflowId });
  console.log("batches completed:", exec.batches);
  console.log("nodes executed   :", exec.nodeIds.join(", "));

  sep("8 · Canvas results");
  const nodeMap = Object.fromEntries(exec.canvas.nodes.map(n => [n.id, n]));
  for (const [id, label] of [
    ["calc-capacity", "Sprint Cost     "],
    ["connector-1",   "Phase Gate      "],
    ["ai-plan",       "Capacity Planner"],
    ["out-score",     "Feasibility     "],
    ["out-rec",       "Recommendation  "],
  ]) {
    const nd = nodeMap[id];
    const state  = nd?.data?.executionState ?? "—";
    const result = (nd?.data?._result ?? "—");
    const preview = typeof result === "string" ? result.slice(0, 120) : JSON.stringify(result).slice(0, 120);
    console.log(`  ${label} [${state}]  ${preview}`);
  }

  sep("✓ Done");
  console.log("Open the AI-built workflow in the canvas:");
  console.log(`  http://localhost:5173/projects/p1/workflows/${workflowId}`);
  console.log("The canvas shows exactly what the AI Planner MCP App constructed and executed.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
