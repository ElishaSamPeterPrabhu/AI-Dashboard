# Roadmap

## Phasing Principles

- Each phase ships something demoable
- Phase 1 has zero dependency on the Agent Service (except auth + agent list) — it can proceed in parallel with any platform access questions
- The Test MCP means Phases 2–3 are fully demoable without any division MCP contacts
- Phases are ordered by value to Trimble internal teams first

---

## Phase 1 — Canvas MVP

**Goal:** A working visual canvas that is demoable to stakeholders. No live AI execution yet.

**Deliverables:**
- [ ] Vite 6 + React 19 + TypeScript app scaffold (matching modus-blueprint stack)
- [ ] TID PKCE auth flow (lifted from `ModusAssistant.tsx`)
- [ ] Account-ID detection + setup banner
- [ ] Modus Web Components chrome: top bar (logo, mode toggle, user menu), left sidebar (node palette), right panel (node config)
- [ ] React Flow canvas: pan, zoom, multi-select, node drag
- [ ] Node types: Idea/Sticky, Text Block, Group/Frame, Process, Decision, Input, Calculator, Chart, Output
- [ ] AI node: visual shell only (gradient border, status badge, agent chip placeholder) — no execution
- [ ] MCP Data node: visual shell only
- [ ] Knowledge node: visual shell only
- [ ] Edge creation with type validation
- [ ] Plan Mode validation: orphans, missing inputs, error/warning badges
- [ ] Plan vs Execute mode toggle (Execute shows "coming soon" in Phase 1)
- [ ] Workflow persistence: save/load JSON to/from backend file store
- [ ] Workflow list / new workflow screen
- [ ] Basic "Bind existing" AI node picker (calls `GET /v1/agents` to list real agents)
- [ ] Trimble Built-Ins palette section (calls `GET /v1/tools`)
- [ ] Test MCP server scaffolded with all tools defined (returns mock data)

**Not in Phase 1:** Agent execution, streaming, simulation, chatbot, Knowledge Base, MCP wiring

---

## Phase 2 — AI Nodes + Simulation

**Goal:** The core simulation loop works end-to-end. Fully demoable with live agents.

**Deliverables:**
- [ ] Auto-provision AI nodes (create agent via `POST /v1/agents` with generated instructions)
- [ ] Bind-existing picker with autocomplete
- [ ] Agent config PATCH on edge connect/disconnect (MCP tools and Knowledge nodes)
- [ ] Alias promotion (auto-promote after save)
- [ ] AG UI / SSE consumer in backend (stream proxy to frontend WebSocket)
- [ ] Execute Mode: run timeline, node indicator states, edge animation
- [ ] AI node running indicators: pulsing halo, token meter, tool-call ticker
- [ ] Post-run: result rendering on nodes, follow-up chip row
- [ ] Expandable reasoning trace per AI node
- [ ] Single-shot workflow run (topological scheduler in backend)
- [ ] Calculator node execution in QuickJS sandbox
- [ ] Decision node execution
- [ ] Test MCP fully wired to AI node tool calls (via Agent Service)
- [ ] Subagent depth validation in Plan Mode
- [ ] Monte Carlo mode: Assumption nodes, Setup Agent, N-iteration scheduler, aggregate results
- [ ] Chart node rendering (Recharts, distribution mode for Monte Carlo)
- [ ] Run history: store run artifacts, list in timeline drawer
- [ ] `ModusAssistant.tsx` chatbot panel: Workflow Author Agent provisioned, Workflow API MCP server running
- [ ] Accept/reject diff UX for chatbot canvas edits
- [ ] AI Data Consent modal before first real MCP execution
- [ ] AI Disclaimer in Execute Mode footer

**Not in Phase 2:** Real Trimble division MCPs, Knowledge nodes, multi-user sharing, Eval nodes

---

## Phase 3 — MCPs + Knowledge + Run History

**Goal:** Live Trimble domain data flows into simulations. The product is ready for internal Trimble pilot.

**Deliverables:**
- [ ] Knowledge node config panel: picker for Trimble Knowledge Libraries
- [ ] Knowledge node connects to AI node (attaches KB to agent config)
- [ ] RAG flow works in simulation: `search_knowledge_base` events animate Knowledge edge
- [ ] MCP node config panel: custom server URL, tool name, schema editor
- [ ] MCP node templates for registered Trimble MCPs (as each division onboards)
- [ ] `{actorToken?scopes=...}` substitution in MCP headers wired through Agent Service
- [ ] Run comparison view: select two runs, see delta on Chart/Output nodes
- [ ] Scenario branching: clone a run with different Input values in one click
- [ ] Ingest node (basic): upload a document from the canvas → creates a Knowledge Library entry
- [ ] Agent soft/hard delete flow when AI node is deleted from canvas
- [ ] Live run mode: re-run when MCP data changes (polling-based initially)
- [ ] First real Trimble division MCP (Connect or Viewpoint — whichever is ready first)

---

## Phase 4 — Productize

**Goal:** Team-ready product with sharing, templates, and governance.

**Deliverables:**
- [ ] Multi-user workflow sharing (read/edit access control using Agent Service RBAC claims)
- [ ] Rebind-agents flow when importing a shared workflow with inaccessible agents
- [ ] Workflow templates: "Feature cost estimation", "Construction schedule risk", "Build vs buy", "Capacity plan"
- [ ] Template library screen
- [ ] Eval node: connect to Evals API for regression-testing workflow outputs across runs
- [ ] User preference persistence: recently used nodes, preferred models
- [ ] AI Personalization: node palette sorted by usage
- [ ] Feedback mechanism: thumbs up/down on AI node results
- [ ] Quota dashboard: per-workflow summary of token + run usage across all AI nodes
- [ ] All available Trimble division MCPs integrated (dependent on division contacts)

---

## Phase 5 — Marketplace

**Goal:** Platform-quality product with community, public templates, and division-published data.

**Deliverables:**
- [ ] Community-published workflow templates
- [ ] Division-published MCP node templates (Trimble teams publish via a registry)
- [ ] Public workflow gallery (opt-in sharing)
- [ ] Workflow versioning history with diff view
- [ ] Voice input (using Trimble Assist voice roadmap feature)
- [ ] Image analysis in AI nodes (using Trimble Assist image roadmap feature)
- [ ] Embedding API: embed the AI Dashboard canvas into other Trimble products

---

## Timeline Estimates (rough)

| Phase | Estimated duration | Key dependency |
|---|---|---|
| Phase 1 | 4–6 weeks | None — can start immediately |
| Phase 2 | 6–8 weeks | TID auth + Agent Service access, Workflow Author Agent provisioned |
| Phase 3 | 4–6 weeks | First division MCP contact; Trimble Knowledge Libraries available |
| Phase 4 | 6–8 weeks | Phase 3 stable, user research from pilot |
| Phase 5 | Ongoing | Community adoption, division MCP roadmaps |

---

## MVP Definition

A "demoable MVP" is Phase 1 + Phase 2 combined. It includes:
- Working canvas with all non-AI node types
- At least one end-to-end AI workflow simulation using the Test MCP
- Chatbot that can build and run a simple workflow
- Monte Carlo on at least one Assumption node

Target for MVP: ~10–14 weeks from kickoff.
