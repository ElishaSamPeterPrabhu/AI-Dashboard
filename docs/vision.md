# AI Dashboard — Vision

## What It Is

AI Dashboard is a node-based visual workspace where teams plan ideas, business processes, and product strategies — then press **Execute** to watch those plans come alive as real-time, agent-driven simulations.

It is the third surface on the Trimble Agentic AI Platform:

| Surface | Audience | What it does |
|---|---|---|
| [Trimble Agent Studio](https://studio.ai.trimble.com) | Agent builders | Configure individual agents: instructions, models, knowledge, MCPs |
| [Trimble Assist](https://assist.ai.trimble.com) | End users | Chat with agents conversationally |
| **AI Dashboard** (new) | Planners, architects, PMs, analysts | Visually orchestrate multiple agents + data sources into runnable, simulatable workflows |

Built as a separate app (`dashboard.ai.trimble.com`) that consumes the Trimble Agent Service API. Visual consistency comes from Trimble Modus Web Components — no Studio codebase changes required.

---

## The Problem

Planning tools today force a choice:

- **Whiteboards** (Miro, FigJam, Mural) are great for thinking but produce static artifacts. You draw a plan, then go do the work somewhere else. AI features are bolted on as text generators.
- **Visual AI workflow builders** (Langflow, Flowise, n8n, Rivet) let you wire up LLM calls but were designed for developers building AI pipelines, not for planners thinking through strategy.
- **Domain tools** (BIM, ERP dashboards, estimators) give you data but cannot represent the *reasoning* and *process* behind decisions.

None of these let you answer: **"If I do this plan, what happens?"**

---

## The Core Insight

A plan is a workflow. A workflow can be simulated. Simulation produces estimates, risks, and decisions — not guesses.

AI Dashboard adds a layer that no current tool has: **AI nodes backed by Trimble Agents** that can reason about the plan, pull live data via MCPs, and return structured simulation results — visualized inline on the canvas, in real time.

The flow:

```
Sketch idea → build workflow → attach AI nodes → attach data sources → press Execute → watch simulation
```

---

## Two Modes

**Plan Mode** — free canvas. Add nodes, connect them, annotate, comment. AI nodes show their bound agent but don't run. Validation highlights structural problems (disconnected nodes, missing inputs, subagent depth violations).

**Execute Mode** — the workflow runs. Edges animate. AI nodes pulse while their bound agents stream responses via the AG UI protocol. Input/Assumption node values become the run context. Results render inline at each node. The run timeline at the bottom lets you step, pause, replay, and branch into scenarios.

---

## Target Users

### Primary: Trimble internal teams
- Product managers planning feature scope, estimating effort, modeling trade-offs
- Construction project planners running schedule and budget simulations against Trimble Connect / Viewpoint data
- Solution architects designing system integrations with Tekla, SketchUp, Maps

### Secondary: Trimble developer ecosystem
- Partners building domain-specific planning tools on top of the Trimble Agentic Platform
- ISVs that want to offer their customers a no-code simulation canvas backed by their own MCP data sources

### Stretch: Trimble customers directly
- Contractors who need to simulate project plans using their own Viewpoint/Connect project data
- BIM managers who want to walk through a model coordination workflow and see risk scores live

---

## What Makes It Different

| Capability | Miro / FigJam | Langflow / n8n | AI Dashboard |
|---|---|---|---|
| Visual canvas | ✓ | Partial | ✓ |
| AI features | Text generation only | Full LLM wiring | ✓ Full agent wiring |
| Live simulation | ✗ | ✗ | ✓ |
| Domain data (MCPs) | ✗ | Manual | ✓ Via Trimble agents |
| Plan → Execute toggle | ✗ | ✗ | ✓ |
| Non-developer audience | ✓ | ✗ | ✓ |
| Trimble platform native | ✗ | ✗ | ✓ TID auth, agent RBAC, quotas |
| Chatbot canvas editing | Limited | ✗ | ✓ Via Workflow Author agent |

The wedge: **"Plan it visually. Press Execute. Watch your Trimble agents simulate it."**

---

## What AI Nodes Are (and Aren't)

An AI node is not a one-shot LLM call. It is a **Trimble Agent** — with its own instructions, selected models, attached tools (MCPs), knowledge libraries, and quotas — invoked as part of a larger workflow.

The binding is hybrid:
- **Bind existing**: pick an agent the user already owns. No new agents created.
- **Auto-provision**: describe the node's purpose; the dashboard creates and manages a dedicated Trimble Agent via the Studio API. Tokens are spent once to generate the agent's instructions. Every subsequent run reuses that compiled configuration.

This means:
- Token costs are predictable and front-loaded.
- Monte Carlo simulations (running the same workflow N times with varied inputs) cost no additional LLM tokens — only agent inference per run, which is quota-controlled in Studio.
- The same agents are visible and editable in Trimble Agent Studio — no shadow AI.

---

## Why Now

- The Trimble Agentic AI Platform is live, with Agent Service API, MCP tool support, AG UI streaming, and an embeddable SDK — all the infrastructure needed.
- Trimble's division MCPs (Connect, Viewpoint, Tekla, Maps) are coming online — there is real domain data to simulate against.
- No competitor in the construction/geospatial/infrastructure space has a simulation canvas. First-mover window is open.
- Internal teams at Trimble already need this — product planning, cross-division alignment, and BIM coordination workflows are all underserved today.
