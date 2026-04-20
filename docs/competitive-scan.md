# Competitive Scan

## Summary

AI Dashboard sits at the intersection of three product categories that currently don't overlap. This scan covers the main players in each and identifies what AI features they have, what's missing, and where AI Dashboard differentiates.

---

## Category 1 — Visual Whiteboards / Ideation

### Miro

**AI features:**
- AI text generation from sticky notes and cards
- "Mind map from prompt" — generates a tree from a text input
- AI summaries of clustered content
- Smart templates with pre-filled placeholder text
- Miro Assist: chat pane that generates shapes, summaries, and action items
- Miro AI for Confluence/Jira integration (export/import)

**What's missing:**
- No concept of execution — everything is static after AI generates it
- No data sources — AI cannot pull live project/domain data
- No simulation — cannot ask "what happens if we follow this plan"
- No agent-per-node model — AI is a single monolithic assistant
- No structured outputs — everything is free text on a canvas

**How AI Dashboard differentiates:** Miro creates; AI Dashboard simulates. Every AI node is a distinct agent with domain-specific instructions and live data, not a generic text model.

---

### FigJam (Figma)

**AI features:**
- FigJam AI: generates diagrams from prompts (flowcharts, affinity maps, timelines)
- AI organization of sticky notes into groups and themes
- AI summaries per section
- "Sort and categorize" for voting/research sessions
- Figma Make / Dev Mode AI for prototype-to-code

**What's missing:**
- Same fundamental gap as Miro — a canvas of static artifacts
- AI is not wired to any execution runtime
- No MCP or tool integration
- No domain data awareness
- No simulation or estimation

**How AI Dashboard differentiates:** FigJam is the planning artifact; AI Dashboard adds the simulation engine that validates the plan.

---

### Whimsical

**AI features:**
- "Generate diagram" from prompt — fastest in class for initial structure
- AI autocompletion inside nodes
- Flow generation (user journeys, org charts, mind maps) from a description

**What's missing:**
- No execution, no simulation, no live data
- AI is a canvas generator, not a reasoner
- No multi-agent model

**How AI Dashboard differentiates:** Whimsical can generate the initial workflow quickly; AI Dashboard can be positioned as "after you've sketched in Whimsical, simulate it here."

---

### Mural

**AI features:**
- AI facilitation: auto-cluster sticky notes, summarize themes
- AI-generated templates from a prompt
- AI summaries of board sections for stakeholder reports

**What's missing:**
- No execution layer
- AI is entirely facilitation-focused, not reasoning-focused

---

### Lucid (Lucidchart + Lucidspark)

**AI features:**
- "Generate diagram" from prompt (flowcharts, ERDs, network diagrams)
- Lucid AI: chat to modify diagrams in-place
- Smart shapes that auto-connect based on semantic meaning
- Integration with Jira/Confluence to auto-generate diagrams from project data

**What's missing:**
- Data integrations are one-way imports, not live simulation
- No concept of "running" a workflow
- No MCP / agent model

**How AI Dashboard differentiates:** Lucid has the best integration story in the whiteboard space but still produces static output. AI Dashboard makes the diagram executable.

---

## Category 2 — Visual AI Workflow Builders

### Langflow

**Positioning:** Open-source visual builder for LLM-powered pipelines (RAG, agents, chains).

**Strengths:**
- Node-based canvas specifically for AI component wiring
- Supports LangChain nodes (LLMs, embeddings, vector stores, tools, agents)
- Live run execution with streaming output
- Python integration for custom nodes
- Growing MCP support

**Gaps relative to AI Dashboard:**
- Built for developers, not planners or business users
- No "Plan Mode" — the canvas IS the deployment config
- No non-AI workflow primitives (Idea node, Decision node, Process step, Assumptions)
- No domain-specific Trimble data integration
- No Plan vs Execute toggle — running is always technical
- Canvas UX is engineering-centric, not whiteboard-centric
- No quota/RBAC model tied to corporate identity (TID)

---

### Flowise

**Positioning:** Low-code drag-and-drop UI for LangChain / LlamaIndex apps.

**Strengths:**
- Very fast to build a chatbot or RAG pipeline
- Large node library (100+ node types)
- API deployment is built-in

**Gaps:**
- Same developer-audience problem as Langflow
- No simulation / estimation use case
- No business workflow primitives
- UI feels like a backend builder, not a planning surface

---

### Rivet (Ironclad)

**Positioning:** Visual AI programming environment. Designed for building and debugging LLM applications.

**Strengths:**
- Excellent debugging tools — step through each node, inspect intermediate values
- Subgraph support (reusable node clusters)
- Good streaming support
- TypeScript integration

**Gaps:**
- Explicitly a developer tool
- No non-technical metaphors (no idea nodes, sticky notes, annotations)
- No Trimble identity / corporate auth model
- No simulation of business plans — purely LLM pipeline

**How AI Dashboard borrows from Rivet:** the step/pause/replay run timeline and the expandable trace per node are directly inspired by Rivet's debugger UX, adapted for non-developers.

---

### n8n

**Positioning:** Workflow automation platform with an AI-compatible node library.

**Strengths:**
- 400+ integrations
- AI Agent node that wraps LLM + tools
- Good at connecting business SaaS to AI
- Can be self-hosted

**Gaps:**
- Workflow-automation mental model, not planning/simulation
- No plan-mode for structuring ideas before wiring execution
- UX is functional, not collaborative
- No whiteboard metaphors

---

### Dify

**Positioning:** LLM application development platform with visual orchestration.

**Strengths:**
- Application types: chatbot, agent, workflow, text generation
- Visual workflow mode with conditional branching
- Supports MCP tools
- Knowledge base with RAG

**Gaps:**
- Application builder, not a planner
- No simulation estimation
- No corporate Trimble identity

---

### ComfyUI

**Positioning:** Visual node graph for Stable Diffusion / generative AI image pipelines.

**Strengths:**
- Excellent node-graph UX for non-developers in the image AI space
- Extremely extensible via community nodes

**Gaps:**
- Completely domain-specific to image generation
- Not relevant to planning/business workflow simulation

**Why it's in this list:** ComfyUI proved that non-developers will adopt node-graph UIs when the domain is right. AI Dashboard's thesis is that planning/simulation is that domain for business users.

---

## Category 3 — Domain Decision / Simulation Tools

### Trimble-specific (existing)
- **Trimble Connect**: project collaboration, document management, BIM coordination — no simulation layer
- **Trimble Viewpoint**: construction ERP — financial reporting but no what-if modeling
- **Navisworks**: clash detection simulation but only for 3D models, not business processes
- **Primavera / MS Project**: schedule simulation but siloed, no AI, no whiteboard integration

**Gap AI Dashboard fills:** connects these data sources via MCPs into a unified canvas where the plan, the data, and the AI reasoning live together.

---

## Feature Matrix

| Capability | Miro | FigJam | Lucid | Langflow | Rivet | n8n | AI Dashboard |
|---|---|---|---|---|---|---|---|
| Visual canvas | ✓ | ✓ | ✓ | Partial | Partial | ✗ | ✓ |
| Non-developer UX | ✓ | ✓ | ✓ | ✗ | ✗ | Partial | ✓ |
| AI text generation | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Agent-per-node | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Plan vs Execute toggle | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Live simulation | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Live data via MCPs | ✗ | ✗ | ✗ | Limited | ✗ | Limited | ✓ |
| Trimble domain MCPs | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (roadmap) |
| Corporate identity (TID) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Agent RBAC / quotas | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Chatbot edits canvas | Partial | Partial | ✗ | ✗ | ✗ | ✗ | ✓ |
| Step/pause/replay runs | ✗ | ✗ | ✗ | Partial | ✓ | ✗ | ✓ |
| Run history / compare | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## Differentiation Statement

AI Dashboard is the only tool that:

1. Combines a whiteboard-quality planning canvas with a real execution and simulation engine.
2. Wires AI nodes directly to managed agents with their own knowledge, tools, models, and quotas — not a generic LLM call.
3. Uses live Trimble domain data (via MCPs on the Trimble Agentic Platform) as first-class simulation inputs.
4. Is designed for non-developers: planners, architects, project managers, and analysts — not prompt engineers.
5. Is native to Trimble corporate identity, meaning it works inside Trimble's existing access-control and licensing model.

The closest competitor is Rivet (developer debugging) + Miro (canvas UX) combined — but that combination doesn't exist, requires two tools, and has none of the Trimble domain integration.
