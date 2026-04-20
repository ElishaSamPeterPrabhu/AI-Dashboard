# AI Node Use Cases

Each AI node on the canvas is backed by a Trimble Agent. This document catalogs the patterns — what the agent's instructions and tooling look like, what inputs it expects, and what outputs it produces.

The patterns are grouped by function. Each entry includes:
- **What it does** in plain language
- **Agent profile** (instructions sketch, tools needed, knowledge libraries)
- **Input schema** (what flows in from connected nodes)
- **Output schema** (what flows out to downstream nodes or Chart nodes)
- **Modus AI Pattern** it uses for its canvas UX

---

## 1. Estimation & Forecasting

### 1a. Effort Estimator
**What it does:** Given a feature or task description and team composition, estimates effort in story points or hours with confidence range.

**Agent profile:**
- Instructions: "You are an effort estimation expert. Given a feature description, team composition, and historical velocity, produce a three-point estimate (optimistic, most likely, pessimistic) with a brief justification."
- Built-in tools: `datetime`, `myprofile`
- Optional MCP: project velocity history from Trimble Connect or a test MCP

**Inputs:**
- `featureDescription: string` (from upstream Idea or Process node)
- `teamSize: number` (from Input node)
- `velocityData?: object` (from MCP Data node, optional)

**Outputs:**
- `optimistic: number`, `mostLikely: number`, `pessimistic: number`
- `unit: "story_points" | "hours" | "days"`
- `justification: string`

**Modus Pattern:** Confidence Indicators (display optimistic–pessimistic range as a confidence band), Explanation Interface (justification expandable below the node)

---

### 1b. Cost Estimator
**What it does:** Converts effort estimates and headcount costs into a budget range, optionally pulling live labor rates from a connected MCP.

**Agent profile:**
- Instructions: "You are a cost estimation expert for construction or software projects. Given effort in hours, team roles, and optional labor rate data, produce a low/mid/high cost estimate."
- Optional MCP: labor rate data from Trimble Viewpoint or test MCP

**Inputs:**
- `effortHours: number` (from Effort Estimator node)
- `teamRoles: string[]` (from Input node)
- `laborRates?: object` (from MCP Data node)

**Outputs:**
- `low: number`, `mid: number`, `high: number`, `currency: string`
- `breakdown: { role: string, hours: number, rate: number }[]`

**Modus Pattern:** Confidence Indicators, Summary (inline cost table on node)

---

### 1c. Timeline Estimator
**What it does:** Given effort estimates and team availability, produces a projected timeline with milestones and risk flags.

**Agent profile:**
- Instructions: "Given effort estimates, team size, and known constraints, produce a project timeline with milestone dates and highlight critical path risks."
- Built-in tools: `datetime`
- Optional MCP: calendar/leave data or schedule data from Trimble Connect

**Inputs:**
- `effortDays: number`
- `teamAvailability: number` (% FTE)
- `startDate: string`
- `constraints?: string[]`

**Outputs:**
- `startDate: string`, `endDate: string`
- `milestones: { name: string, date: string }[]`
- `risks: string[]`

**Modus Pattern:** Confidence Indicators, AI Loading & Processing (streaming milestone list)

---

### 1d. ROI Calculator Agent
**What it does:** Analyzes a plan against expected revenue impact and costs to produce an ROI estimate and payback period.

**Agent profile:**
- Instructions: "You are a financial analyst. Given implementation cost, expected revenue impact, and time horizon, calculate ROI, NPV, and payback period."

**Inputs:**
- `implementationCost: number` (from Cost Estimator node)
- `expectedRevenue: number` (from Input node)
- `timeHorizonMonths: number`

**Outputs:**
- `roi: number` (percentage)
- `npv: number`
- `paybackMonths: number`
- `sensitivity: { optimistic: number, base: number, pessimistic: number }`

**Modus Pattern:** Explanation Interface (show NPV formula trace), Confidence Indicators

---

## 2. Risk & Decision

### 2a. Risk Scorer
**What it does:** Reads a plan description and connected data, identifies risks, assigns probability and impact scores, and outputs a prioritized risk register.

**Agent profile:**
- Instructions: "You are a risk assessment expert. Given a plan and context data, identify top risks, score them by probability (1–5) and impact (1–5), and suggest mitigations."
- Optional MCP: historical incident data, project risk database

**Inputs:**
- `planDescription: string`
- `contextData?: object`

**Outputs:**
- `risks: { title: string, probability: number, impact: number, score: number, mitigation: string }[]`
- `overallRiskLevel: "low" | "medium" | "high" | "critical"`

**Modus Pattern:** Confidence Indicators (risk level color badge), Explanation Interface (risk table)

---

### 2b. Decision Recommender
**What it does:** Given a set of options and criteria (with optional weights), evaluates each option and recommends the best choice with rationale.

**Agent profile:**
- Instructions: "You are a structured decision analyst. Given options and evaluation criteria, score each option using a weighted decision matrix and recommend the top choice with justification."

**Inputs:**
- `options: string[]`
- `criteria: { name: string, weight: number }[]`
- `contextData?: object`

**Outputs:**
- `recommendation: string`
- `scores: { option: string, score: number, breakdown: object }[]`
- `rationale: string`

**Modus Pattern:** Explanation Interface (decision matrix table), AI Recommendation Systems

---

### 2c. Dependency Analyzer
**What it does:** Reads the workflow structure and flags circular dependencies, missing inputs, and critical path bottlenecks.

**Agent profile:**
- Instructions: "You are a workflow analyst. Review the workflow graph structure and identify: cycles, orphaned nodes, blocking dependencies, and which path determines the longest lead time."
- No external MCPs needed — operates on workflow metadata passed as run context

**Inputs:**
- `workflowGraph: object` (serialized DAG from run context)

**Outputs:**
- `issues: { type: "cycle" | "orphan" | "bottleneck", nodeIds: string[], description: string }[]`
- `criticalPath: string[]`

**Modus Pattern:** AI Explanation Interfaces, AI Error Handling (surface issues inline on affected edges)

---

## 3. Content & Generation

### 3a. Workflow Generator
**What it does:** Given a plain-language description of a goal, generates a complete workflow as structured JSON that the canvas can hydrate into nodes and edges.

**Agent profile:**
- Instructions: "You are an AI Dashboard workflow architect. Given a goal description, produce a structured workflow JSON matching the AI Dashboard node schema. Include Idea, Process, Decision, Input, and AI nodes as appropriate. Return only valid JSON."
- Built-in tools: `web_search` (to research best-practice process steps for the domain)

**Inputs:**
- `goalDescription: string`
- `domain?: string`

**Outputs:**
- `workflow: WorkflowSchema` (parsed by the canvas to hydrate nodes/edges)

**Modus Pattern:** AI Content Generation, Prompt Initial CTA (this node is often the entry point after an empty canvas prompt)

---

### 3b. Workflow Critic
**What it does:** Reviews an existing workflow, identifies logical gaps, missing steps, and improvement opportunities — returns structured feedback.

**Agent profile:**
- Instructions: "You are a workflow quality reviewer. Analyze the provided workflow for logical completeness, missing steps, unclear decision criteria, and improvement opportunities. Return structured feedback."

**Inputs:**
- `workflowSummary: string` (auto-generated from the serialized DAG)

**Outputs:**
- `gaps: { nodeId?: string, description: string, severity: "low" | "medium" | "high" }[]`
- `suggestions: string[]`
- `overallQuality: "poor" | "fair" | "good" | "excellent"`

**Modus Pattern:** AI Collaborative Editing (suggestions shown as diff overlay), AI Human Handoff (user accepts/rejects each suggestion)

---

### 3c. Summarizer
**What it does:** Distills upstream node outputs (text, data) into a concise human-readable summary.

**Agent profile:**
- Instructions: "Summarize the provided content concisely, preserving key numbers, decisions, and action items. Format as bullet points."

**Inputs:**
- `content: string | object` (any upstream text or structured data)
- `maxWords?: number`

**Outputs:**
- `summary: string`
- `keyPoints: string[]`

**Modus Pattern:** AI UX Summary pattern

---

### 3d. Action Item Extractor
**What it does:** From a simulation result or set of sticky notes, extracts a structured list of action items with owners and due dates.

**Agent profile:**
- Instructions: "Extract concrete action items from the provided content. For each action, identify: the task, the responsible role, and a suggested due date if inferable."
- Built-in tools: `datetime`, `user_directory`

**Inputs:**
- `content: string`

**Outputs:**
- `actions: { task: string, owner?: string, dueDate?: string }[]`

**Modus Pattern:** AI Smart Suggestions (actions appear as chips for user to accept)

---

## 4. Data Enrichment & Analysis

### 4a. Data Transformer
**What it does:** Takes raw data from a connected MCP Data node and transforms/aggregates it into a structured format for downstream nodes.

**Agent profile:**
- Instructions: "You are a data analyst. Transform the provided raw data into the requested output schema. Summarize anomalies and missing values."

**Inputs:**
- `rawData: object` (from MCP Data node)
- `outputSchema: object` (defined in node config)

**Outputs:**
- `transformed: object`
- `anomalies: string[]`
- `completeness: number` (0–1)

**Modus Pattern:** AI Loading & Processing (streaming transform), Confidence Indicators (data completeness)

---

### 4b. Trend Analyzer
**What it does:** Given time-series data from a connected MCP, identifies trends, anomalies, and forecasts the next N periods.

**Agent profile:**
- Instructions: "You are a data analyst specializing in time-series. Identify trends, seasonal patterns, anomalies, and produce a short-term forecast."
- Optional MCP: Trimble Connect project KPIs, Viewpoint financials, test MCP

**Inputs:**
- `timeSeries: { date: string, value: number }[]`
- `forecastPeriods: number`

**Outputs:**
- `trend: "up" | "down" | "flat" | "volatile"`
- `forecast: { date: string, value: number, confidence: number }[]`
- `anomalies: { date: string, description: string }[]`

**Modus Pattern:** Confidence Indicators on forecast points, AI Explanation Interfaces (show which signal drove the trend call)

---

### 4c. Semantic Search Node
**What it does:** Uses a connected Knowledge Library to answer a question from upstream context, returning relevant passages with citations.

**Agent profile:**
- Uses RAG workflow — `search_knowledge_base` virtual tool
- Instructions: "Answer the question using only information from the provided knowledge base. Cite your sources."

**Inputs:**
- `question: string`
- `knowledgeLibraryId: string` (from connected Knowledge node)

**Outputs:**
- `answer: string`
- `citations: { excerpt: string, source: string }[]`
- `confidence: number`

**Modus Pattern:** AI Explanation Interfaces (citations expandable), Sources tuner (show which KB chunks matched)

---

## 5. Simulation Orchestrators

### 5a. Monte Carlo Setup Agent
**What it does:** Reads Input/Assumption nodes marked as distributions (min/max/most-likely), configures the Monte Carlo sampling parameters, and seeds the simulation engine.

**Agent profile:**
- Instructions: "Given the provided input distributions, determine appropriate probability distributions (triangular, normal, uniform) and generate N sample sets for Monte Carlo simulation. Return the sample sets as structured JSON."

**Inputs:**
- `assumptions: { name: string, min: number, max: number, mostLikely?: number }[]`
- `iterations: number`

**Outputs:**
- `sampleSets: Record<string, number>[]` (N samples, one per iteration)

**Modus Pattern:** AI Loading & Processing (generating N samples), Parameters tuner (iterations slider)

---

### 5b. Process Orchestrator
**What it does:** Reads the workflow context, decides which downstream branches are relevant for the current scenario, and emits routing signals to the simulation engine.

**Agent profile:**
- Instructions: "You are a process orchestration agent. Based on the provided workflow context and input data, determine which branches of the workflow are relevant and in what order they should execute."
- Built-in tools: `get_run_context` virtual tool

**Inputs:**
- `workflowContext: object` (full run context from all Input nodes)

**Outputs:**
- `activeBranches: string[]` (node IDs of branches to activate)
- `executionOrder: string[]`
- `skipReason: Record<string, string>` (why inactive branches were skipped)

**Modus Pattern:** AI Workflow Automation pattern, Explanation Interface (show routing decision)

---

### 5c. Scenario Comparator
**What it does:** Given two or more completed run results, compares them across key metrics and produces a structured comparison with a recommendation.

**Agent profile:**
- Instructions: "Compare the provided scenario results across all numeric outputs. Identify which scenario performs better on each metric. Produce a recommendation with trade-off analysis."

**Inputs:**
- `scenarios: { name: string, results: object }[]`
- `metrics: string[]`

**Outputs:**
- `comparison: { metric: string, winner: string, values: Record<string, number> }[]`
- `recommendation: string`
- `tradeoffs: string`

**Modus Pattern:** AI Recommendation Systems, Explanation Interface (comparison table)

---

## 6. Trimble Domain-Specific

### 6a. Project Health Checker (Trimble Connect / Viewpoint)
**What it does:** Pulls project KPIs from a connected Trimble MCP and produces a health summary with RAG/risk flags.

**Agent profile:**
- Instructions: "You are a construction project analyst. Review the provided project data and produce a health report: schedule status, budget status, open issues count, and risk rating."
- MCP: Trimble Connect or Viewpoint (when available); test MCP in the interim

**Inputs:**
- `projectData: object` (from MCP Data node)

**Outputs:**
- `scheduleStatus: "on_track" | "at_risk" | "delayed"`
- `budgetStatus: "on_track" | "at_risk" | "over"`
- `openIssues: number`
- `riskRating: "low" | "medium" | "high"`
- `summary: string`

---

### 6b. BIM Clash Summarizer (Tekla / Navisworks)
**What it does:** Given clash detection data from a connected BIM MCP, summarizes clash statistics by discipline and priority.

**Inputs:**
- `clashData: object` (from MCP Data node — Tekla or test MCP)

**Outputs:**
- `totalClashes: number`
- `byDiscipline: Record<string, number>`
- `criticalClashes: number`
- `summary: string`

---

### 6c. Route Optimizer Summary (Trimble Maps)
**What it does:** Given origin/destination and constraints, calls the Trimble Maps MCP and summarizes the optimal route options.

**Inputs:**
- `origin: string`, `destination: string`
- `constraints?: object`

**Outputs:**
- `recommendedRoute: object`
- `alternatives: object[]`
- `summary: string`
