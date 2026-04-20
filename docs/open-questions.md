# Open Questions

Unresolved items that need research, a decision, or a conversation with another team. Each entry has a proposed answer or next action.

---

## Platform & API

**Q1: What are the exact base URLs for Models & Inference, Knowledge Base, Ingest, and Evals APIs?**
- The Agent Service URL was visible in the API reference (`https://api.trimble.com/v1`)
- The other four API base URLs were not visible in the pages visited
- **Next action:** Check `https://developer.ai.trimble.com/api` (Models, Knowledge, Ingest, Evals tabs) or ask on the Trimble developer forums

**Q2: What TID scopes are required for Knowledge Base, Ingest, and Evals APIs beyond `openid agents`?**
- **Next action:** Read each API's OpenAPI document overview section

**Q3: Is there an npm package for the Agent Service TypeScript client, or should we generate one from OpenAPI?**
- **Next action:** Check `https://developer.ai.trimble.com` npm registry section; if not, use `openapi-typescript` to generate types from the downloaded OpenAPI spec

**Q4: What is the `account_id` claim behavior in staging vs production TID environments?**
- The staging environment is `https://id.stage.trimble.com`; confirm the claim is present in both environments
- **Next action:** Test with a staging TID token

**Q5: Does the Agent Service support batch creation of agents?**
- We need to provision multiple agents when a workflow template has many AI nodes
- Currently planning sequential `POST /v1/agents` calls
- **Next action:** Check the batch-get and batch-create endpoints in the API reference

---

## AI Node Design

**Q6: How should we handle the case where an AI node's output doesn't match the declared `outputSchema`?**
- Current plan: fall back to `{ text: string }` (raw final message)
- Alternative: show a "schema mismatch" warning on the node and block downstream execution
- **Decision needed:** which is more useful — lenient fallback or strict enforcement?
- **Proposed answer:** Lenient in Phase 2, strict enforcement as a toggleable option in Phase 3

**Q7: For nested AI nodes (A → B via subagent), does B always see A's full output, or only the specified output port?**
- Subagents return their full final message as a `TOOL_CALL_RESULT`
- The dashboard needs to map the port connection to the correct field in A's output
- **Next action:** Prototype this in Phase 2 and determine if prompt engineering in B's instructions can reliably extract the right field

**Q8: Should AI node descriptions be editable directly on the canvas, or only in the config panel?**
- Inline editing risks accidental description changes that trigger re-provisioning
- **Proposed answer:** Config panel only, with a pencil icon on the node that opens the panel

---

## Simulation Engine

**Q9: What is the right max concurrency for Monte Carlo agent runs?**
- Each iteration creates a thread + run on the Agent Service
- Too many concurrent runs may hit rate limits or exhaust Agent Service quota
- **Proposed answer:** Start with max 5 concurrent; expose as a config option

**Q10: How should the simulation engine handle partial failures in Monte Carlo mode?**
- If 3 of 100 iterations fail (e.g. 429 quota hit), should the run fail or complete with 97 results?
- **Proposed answer:** Complete with available results; show a "97/100 iterations succeeded" warning

**Q11: Should the "Live" run mode (re-run on MCP data change) use polling or webhooks?**
- Polling is simpler for MVP; webhooks require MCP servers to support push
- **Proposed answer:** Polling (configurable interval, default 5 min) for MVP; webhooks if/when MCPs support them

---

## Modus & UI

**Q12: Which version of modus-blueprint should we pin for the lifted components (`ModusAssistant.tsx`, etc.)?**
- modus-blueprint is actively developed
- **Next action:** Record the current git commit hash of modus-blueprint in this doc and establish a review process for picking up changes

**modus-blueprint commit at time of plan:** (to be recorded at start of Phase 1)

**Q13: Does React Flow v12 (`@xyflow/react`) support custom node resizing that plays well with Modus Web Components (Web Components in shadow DOM)?**
- Web Components in shadow DOM can have event bubbling issues with drag interactions
- **Next action:** Build a minimal proof-of-concept with a `ModusWcButton` inside a React Flow custom node in Phase 1 spike

**Q14: Should the canvas use `ReactFlowProvider` with a shared Zustand store, or full Zustand with React Flow as a controlled component?**
- Controlled approach gives us more flexibility (chatbot can imperatively modify state)
- **Proposed answer:** Zustand as the single source of truth; React Flow receives `nodes` and `edges` as controlled props

---

## Trimble Division MCPs

**Q15: Who are the right contacts at each Trimble division for MCP onboarding?**
- **Connect:** to be identified
- **Viewpoint:** to be identified
- **TCO:** to be identified
- **Tekla:** to be identified
- **Maps:** to be identified
- **Action:** reach out through internal Trimble channels

**Q16: Do any Trimble division products already have MCP servers deployed?**
- The modus-docs MCP (`https://modus-docs-mcp-eve...azurewebsites.net/mcp`) exists — confirms the pattern works
- **Next action:** Ask on Trimble developer forums or check the platform showcase

---

## Product & Strategy

**Q17: Should the AI Dashboard be accessible to non-Trimble users (e.g. Trimble customers directly)?**
- Current plan: Trimble employees + AAIP license holders for AgentCreator; broader for User role
- **Decision needed by:** before Phase 4 (sharing/templates)

**Q18: How does AI Dashboard relate to Trimble's existing product planning tools (Jira, Confluence, Monday, etc.)?**
- Potential integration: import a Jira epic as an Idea node, or export a workflow's results back to Confluence
- **Out of scope for MVP**, but track as a Phase 4+ integration idea

**Q19: Should workflow run artifacts be stored in Trimble Connect (CDE) for projects where that's the system of record?**
- This would make simulation results retrievable alongside BIM and project docs
- **Next action:** Evaluate after Phase 3 when Connect MCP is available

**Q20: What is the marketing angle for AI Dashboard vs. the existing Trimble AI narrative?**
- Current Trimble AI narrative focuses on Assist (chat) + Studio (agent builder)
- AI Dashboard adds a third dimension: simulation and planning
- **Action:** Draft a one-pager for internal stakeholders after Phase 1 demo
