# Platform API Matrix

Which of the five Trimble Agentic Platform APIs we depend on, and in which build phase.

---

## APIs

| API | Base URL | Auth scope |
|---|---|---|
| Agent Service | `https://api.trimble.com/v1` (prod) | `openid agents` |
| Models & Inference | (OpenAI-compatible gateway URL from platform docs) | `openid` |
| Knowledge Base | (from platform docs) | `openid agents` |
| Ingest | (from platform docs) | `openid agents` |
| Evals | (from platform docs) | `openid agents` |

---

## Phase 1 — Canvas MVP (Shell + non-AI nodes)

| API | Endpoints used | Purpose |
|---|---|---|
| Agent Service | `GET /v1/agents` | Pre-fill the "Bind existing" picker so AI node design is mockable |
| Agent Service | `GET /v1/tools` | Populate the Trimble Built-Ins palette section |
| Agent Service | (none others) | No agent runs yet in Phase 1 |
| Models & Inference | None | Not needed yet |
| Knowledge Base | None | Not needed yet |
| Ingest | None | Not needed yet |
| Evals | None | Not needed yet |

Phase 1 scope: React Flow canvas, Modus chrome, TID PKCE auth, non-AI node types, Plan/Execute toggle with stubbed executor, JSON persistence, Test MCP server scaffolded but not wired.

---

## Phase 2 — Agent-backed AI Nodes + Simulation

| API | Endpoints used | Purpose |
|---|---|---|
| Agent Service | `POST /v1/agents` | Auto-provision AI nodes |
| Agent Service | `GET /v1/agents`, autocomplete | Bind-existing picker |
| Agent Service | `PATCH /v1/agents/{id}/configs` | Update agent tools/KB when edges change |
| Agent Service | `PATCH /v1/agents/{id}/aliases/production` | Publish config after edit |
| Agent Service | `POST /v1/agents/{id}/threads` | Create thread per AI node per run |
| Agent Service | `POST /v1/threads/{id}/runs` | Execute agent, SSE stream |
| Agent Service | `GET /v1/agents/{id}?fields=usage` | Per-node quota display |
| Agent Service | `POST /v1/batch-get` | Load workflow with multiple AI nodes |
| Agent Service | `GET /v1/agents/{id}/reports/runs` | Usage sparklines in node panel |
| Models & Inference | TBD | Used if Calculator node needs a one-off LLM call for formula generation (build phase of AI node) |
| Knowledge Base | None (accessed through agent, not directly) | RAG via `search_knowledge_base` virtual tool |
| Ingest | None | Not yet |
| Evals | None | Not yet |

Phase 2 scope: AI node, AI node indicators, AG UI/SSE consumer, hybrid binding UX, Monte Carlo simulation, Workflow Author Agent, `ModusAssistant.tsx` chatbot panel, Test MCP fully wired.

---

## Phase 3 — MCPs + Knowledge Nodes

| API | Endpoints used | Purpose |
|---|---|---|
| Agent Service | All Phase 2 endpoints + | |
| Agent Service | `DELETE /v1/agents/{id}` | Cleanup auto-provisioned agents when nodes are deleted |
| Knowledge Base | `GET /v1/knowledge-libraries` | Populate Knowledge node picker |
| Knowledge Base | `GET /v1/knowledge-libraries/{id}` | Display library details in Knowledge node config |
| Ingest | `POST /v1/ingest` | Future: "Knowledge node" that lets users upload files directly from the canvas |
| Evals | None | Not yet |

Phase 3 scope: MCP Data nodes wired to agent tools, Knowledge nodes, real Trimble division MCPs as available, run history / comparison view.

---

## Phase 4 — Productize

| API | Endpoints used | Purpose |
|---|---|---|
| All Phase 3 endpoints + | | |
| Agent Service | `GET /v1/users/directory` | Workflow share dialog (resolve user names) |
| Agent Service | Thread sharing (if available) | Shared run history |
| Evals | `POST /v1/evals/datasets`, `POST /v1/evals/runs` | Eval node for regression-testing workflow outputs |

Phase 4 scope: multi-user sharing, workflow templates, public gallery, comparison view, Eval nodes.

---

## API Dependency Summary

| API | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| Agent Service | Partial (list + tools) | Full | Full + delete | Full + user directory |
| Models & Inference | — | Possible (formula gen) | — | — |
| Knowledge Base | — | — | ✓ (list + get) | ✓ |
| Ingest | — | — | Scaffolded | ✓ |
| Evals | — | — | — | ✓ |

---

## OpenAPI Documents

Each API's OpenAPI document is downloadable from `https://developer.ai.trimble.com/api/agents` (and equivalent per API). Import into Postman or use for type generation.

Action items:
- [ ] Download Agent Service OpenAPI spec and generate TypeScript types with `openapi-typescript`
- [ ] Confirm base URLs for Models & Inference, Knowledge Base, Ingest, and Evals (not yet documented in visited pages)
- [ ] Confirm exact TID scopes required per API beyond `openid agents`
