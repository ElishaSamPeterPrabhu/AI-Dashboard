# Feature List — Base, Novel, and Next

Three tiers: what you need just to open the product (**Base**), what makes it genuinely new and worth building (**Novel**), and everything that requires more time, contacts, or platform maturity (**Next**).

---

## Base Features
*The minimum needed to have a working, shippable product. All of these are achievable with what we have today (modus-blueprint stack + existing Agent Service access + Test MCP). Target: Phase 1 + Phase 2.*

### Canvas
- [ ] Pan, zoom, multi-select, drag-to-reposition nodes
- [ ] Edge creation with type validation (incompatible port types rejected)
- [ ] Plan vs Execute mode toggle — top bar segmented control
- [ ] Node config panel (right sidebar, opens on click)
- [ ] Node palette (left sidebar, all node types grouped by category)
- [ ] Workflow save / load (JSON persistence to backend file store)
- [ ] Workflow list screen + new workflow button

### Node Types (Base Set)
- [ ] **Idea / Sticky** — colored note, inline text edit, no execution
- [ ] **Text Block** — rich-text label/annotation
- [ ] **Group / Frame** — container that collapses
- [ ] **Process / Action** — named step, pass-through, visual anchor
- [ ] **Input** — typed scalar value, becomes run context
- [ ] **Calculator** — JS formula in QuickJS sandbox, no LLM
- [ ] **Output / Result Card** — displays a formatted scalar result
- [ ] **Chart** — inline Recharts bar/line/area chart

### AI Node (Base)
- [ ] Bind to an existing Trimble Agent (picker with `GET /v1/agents`)
- [ ] Auto-provision a new agent from a description (requires AgentCreator role)
- [ ] Status badge: `idle | provisioning | ready | running | done | error`
- [ ] AI gradient border (Modus `AiUxGradientFrame`)
- [ ] Bound-agent chip (avatar + name, click → Agent Studio)
- [ ] Run the agent on Execute (single-shot, AG UI/SSE stream)
- [ ] Result rendered inline on node after run

### Simulation (Base)
- [ ] Single-shot workflow run — topological DAG scheduler
- [ ] Run context built from Input nodes, passed to every AI node
- [ ] Edge animation during execution (data flow + tool calls)
- [ ] Node indicator while running (pulse + token meter + tool-call ticker)
- [ ] Run timeline in bottom bar (progress dots, elapsed time, stop button)
- [ ] Test MCP wired — AI nodes can call Test MCP tools during simulation

### Auth
- [ ] TID PKCE auth flow (lifted from `ModusAssistant.tsx`)
- [ ] Account-ID detection + setup banner
- [ ] AgentCreator role detection (show/hide auto-provision option)

### Plan Mode Validation
- [ ] Orphaned nodes flagged
- [ ] Missing required input ports flagged
- [ ] AI node not bound → "Not configured" warning
- [ ] Cycle detection → blocks Execute toggle
- [ ] Errors block Execute Mode; warnings do not

---

## Novel Features
*What makes AI Dashboard different from every other tool. These are the things no competitor has. All achievable in Phase 2 with the platform we have.*

### AI Node — Compile-Once Model
- [ ] User writes a description → agent config is generated and stored once (build phase)
- [ ] Every subsequent run reuses the stored config — no re-provisioning, no LLM re-call
- [ ] Description hash stored on node — stale badge appears if description drifts from live agent config
- [ ] "Sync agent" button re-provisions on demand

### AI Node Indicators (near-node, always visible)
- [ ] Provisioning shimmer: animated border + "Setting up agent…" while auto-provisioning

### Monte Carlo Simulation
- [ ] **Assumption node** — value configured as a distribution (triangular / uniform / normal) instead of a fixed value
- [ ] Monte Carlo Setup Agent generates N sample sets from distributions
- [ ] N iterations run in parallel (max 5 concurrent by default)
- [ ] Output nodes show P10 / P50 / P90 instead of a single value after Monte Carlo run
- [ ] Chart nodes render output as a distribution histogram after Monte Carlo
- [ ] "Preparing..." shimmer on Assumption nodes while samples are being generated
- [ ] "X / N iterations complete" progress in run timeline

### Chatbot That Edits the Canvas
- [ ] Floating chat panel (Modus `ai-ux-floating-agent-chat` pattern, reuses `ModusAssistant.tsx`)
- [ ] Workflow Author Agent: purpose-built Trimble Agent with Workflow API MCP tools
- [ ] Chatbot can `addNode`, `removeNode`, `connect`, `disconnect`, `setNodeConfig`, `generateWorkflow`, `runWorkflow`
- [ ] **Accept/reject diff UX**: chatbot edits appear as pending overlays on the canvas (dashed blue for adds, red overlay for removes)
- [ ] Bulk accept / reject all + per-node accept / reject
- [ ] Chatbot can generate a complete workflow from a prompt ("Plan a feature cost estimation")

### Workflow Generation from Prompt (Empty Canvas)
- [ ] Prompt Initial CTA on empty canvas ("What would you like to plan?")
- [ ] Suggestion chips: "Plan a feature", "Estimate project cost", "Construction schedule risk"
- [ ] AI generates a full workflow as structured JSON → canvas hydrates it as real nodes/edges
- [ ] User can regenerate or tweak the generated workflow

### Subagent-Aware Canvas
- [ ] When AI node A feeds AI node B, B's agent config uses A as a subagent (not just a data dependency)
- [ ] Plan Mode validates subagent chain depth ≤ 3, flags violations with red edges + explanation
- [ ] Parent and child AI node indicators animate simultaneously during nested runs

---

## Next Features
*Good ideas, but require more time, platform maturity, division contacts, or are too complex for the initial build. Schedule after MVP is stable.*

### Canvas
- [ ] Decision node (JS expression branching — needs robust edge routing UX)
- [ ] Loop Frame (repeat child workflow per array item — complex execution semantics)
- [ ] Node versioning / migration system (needed when node schemas evolve)
- [ ] Undo / redo (React Flow supports it, but needs care with agent provisioning side effects)
- [ ] Keyboard shortcuts (delete, duplicate, group selection)
- [ ] Mini-map (React Flow built-in, enable later)
- [ ] Auto-layout (AI node for auto-arranging the DAG)

### AI Node
- [ ] Node-level model override (change model per AI node independently of agent config)
- [ ] Output schema editor (define structured output ports declaratively — complex UI)
- [ ] Output schema mismatch → strict enforcement mode (currently lenient fallback)
- [ ] Per-node quota override (requires Admin role on the agent)
- [ ] Feedback (thumbs up/down on AI node results → feeds Agent training)
- [ ] Node-level run history (browse past runs for this specific node across workflows)
- [ ] Live token + latency meter while agent is running (from AG UI metadata events)
- [ ] Tool-call ticker: inline chips for each tool called (`modus-docs`, `datetime`, `web_search`, etc.)
- [ ] Clicking a tool chip highlights the corresponding MCP/Knowledge edge on the canvas
- [ ] Expandable reasoning trace (full AG UI event log, collapsed by default)
- [ ] Confidence band on numeric outputs (P10–P90 range as a horizontal bar, Modus Confidence Indicator pattern)

### Simulation
- [ ] Run comparison view — delta highlighting on Chart/Output nodes across two runs
- [ ] Scenario branching — clone a run with different Input values in one click
- [ ] Live run mode — re-run when MCP data changes (polling or webhook)
- [ ] Run replay — step through a past run event by event
- [ ] Sensitivity analysis — which Assumption node drives the most output variance (from Monte Carlo results)

### MCP & Knowledge
- [ ] MCP Data node (full config panel: server URL, tool name, schema editor)
- [ ] Knowledge node (wires a Trimble Knowledge Library to an AI node for RAG)
- [ ] Ingest node — upload a document from the canvas → creates a Knowledge Library entry
- [ ] MCP node templates for Trimble division MCPs (Connect, Viewpoint, Tekla, Maps, etc.)
- [ ] `{actorToken?scopes=...}` substitution in MCP headers wired through Agent Service
- [ ] RAG edge animation (`search_knowledge_base` events animate the Knowledge edge)
- [ ] Agent soft/hard delete cleanup when AI node is removed

### Chatbot
- [ ] `compareRuns`, `explainNode` chatbot tools
- [ ] Chatbot-generated workflow can be previewed as a diff before being applied (full review mode)
- [ ] Chatbot aware of run results ("explain why the cost estimate is $120k")

### Sharing & Collaboration
- [ ] Workflow sharing with read/edit access (using Agent Service RBAC claims)
- [ ] Rebind-agents flow for shared workflows where the recipient lacks agent access
- [ ] **Linked Projects** — a project groups multiple workflows; linking a project merges all its workflow canvases into one unified "mega-canvas" where cross-workflow connections can be drawn (e.g. output of workflow A becomes input of workflow B)
- [ ] Workflow templates library (pre-built workflows users can fork)
- [ ] Real-time multi-cursor (complex, requires CRDT or OT)

### Trimble Platform
- [ ] First real Trimble division MCP (Connect or Viewpoint — needs division contact)
- [ ] Eval node (connect to Evals API to regression-test workflow outputs)
- [ ] Quota dashboard (per-workflow token + run usage summary across all AI nodes)
- [ ] Agent usage sparkline in node config panel (Reports API)

### Product
- [ ] User preference persistence (recently used nodes, preferred models)
- [ ] AI Personalization (node palette sorted by usage frequency)
- [ ] AI Data Consent modal before first execution against a real (non-Test) MCP
- [ ] Public workflow gallery
- [ ] Embedding API (embed the canvas in other Trimble products)
- [ ] Voice input (needs Trimble Assist voice feature, on their roadmap)
- [ ] Image analysis in AI nodes (needs Trimble Assist image feature, on their roadmap)

---

## Summary Table

| Category | Base | Novel | Next |
|---|---|---|---|
| Canvas | Pan/zoom, edges, palette, save/load | Empty canvas prompt + workflow generation | Decision node, Loop, undo/redo, mini-map |
| Node types | Idea, Text, Group, Process, Input, Calculator, Output, Chart | Assumption (distribution) node | MCP Data node, Knowledge node, Ingest node, Decision, Loop |
| AI node | Bind/provision, single-shot run, result on node | Compile-once, provisioning shimmer, subagent wiring | Model override, output schema editor, feedback, live indicators (token meter, tool ticker, confidence band, trace) |
| Simulation | Single-shot with Test MCP, run timeline | Monte Carlo with distributions | Run comparison, live mode, sensitivity analysis, replay |
| Chatbot | — | Full canvas-editing chatbot with accept/reject diff | Compare runs, explain results |
| Auth | TID PKCE, account-ID detection | AgentCreator gating UX | — |
| MCP / Knowledge | Test MCP wired | — | Full MCP config, Knowledge nodes, division MCPs, RAG |
| Sharing | — | — | Multi-user sharing, templates, rebind flow |
| Platform | Agent Service (agents, threads, runs, tools) | — | Evals API, Ingest API, Reports API, quota dashboard |
