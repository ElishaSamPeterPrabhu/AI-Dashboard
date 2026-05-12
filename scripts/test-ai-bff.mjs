#!/usr/bin/env node
/**
 * Smoke-test Trimble AI via the Nest BFF (same paths as the canvas).
 *
 * 1. GET /api/health — require agentKeySet
 * 2. POST /api/agents/provision — use new agent when AgentCreator allows
 * 3. Else GET /api/agents — use first listed agent (same as "Bind existing")
 * 4. POST /api/agents/:id/runs — minimal run
 *
 * Usage: API_BASE=http://127.0.0.1:3000/api node scripts/test-ai-bff.mjs
 */

const BASE = (process.env.API_BASE ?? "http://127.0.0.1:3000/api").replace(/\/$/, "");

async function main() {
  const healthRes = await fetch(`${BASE}/health`);
  const health = await healthRes.json();
  console.log("health:", health);
  if (!health.agentKeySet) {
    console.error("Failing: server has no TRIMBLE_AGENT_API_KEY (see server/.env).");
    process.exit(1);
  }

  let agentId = null;
  let agentLabel = "";

  const provRes = await fetch(`${BASE}/agents/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Smoke ${Date.now()}`,
      systemPrompt: "You only reply with the single word OK.",
    }),
  });
  const provBody = await provRes.json().catch(() => ({}));

  if (provRes.ok && provBody.agentId) {
    agentId = provBody.agentId;
    agentLabel = "provisioned";
    console.log("provision: ok →", agentId);
  } else {
    console.log("provision:", provRes.status, provBody.error ?? provBody);
    const listRes = await fetch(`${BASE}/agents`);
    const list = await listRes.json();
    if (!Array.isArray(list) || list.length === 0) {
      console.error("Failing: GET /api/agents returned no agents to bind.");
      process.exit(1);
    }
    agentId = list[0].id;
    agentLabel = `listed: ${list[0].name ?? agentId}`;
    console.log("using first listed agent →", agentId, `(${list[0].name})`);
  }

  const runRes = await fetch(`${BASE}/agents/${encodeURIComponent(agentId)}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodeId: "smoke-node",
      workflowId: "wf-smoke",
      systemPrompt: "Greet the user in one short sentence only.",
      inputContext: { demo: 1, pair: 2 },
    }),
  });
  const runText = await runRes.text();
  let runBody;
  try {
    runBody = JSON.parse(runText);
  } catch {
    console.error("Failing: non-JSON from runs", runRes.status, runText.slice(0, 400));
    process.exit(1);
  }

  console.log("run:", {
    agent: agentLabel,
    status: runBody.status,
    resultPreview: typeof runBody.result === "string" ? runBody.result.slice(0, 160) : runBody.result,
    errorMessage: runBody.errorMessage,
  });

  if (runBody.status !== "done") {
    process.exit(1);
  }
  console.log("OK — AI BFF path works.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
