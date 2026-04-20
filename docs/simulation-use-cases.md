# Simulation Use Cases

The simulation engine is the capability that separates AI Dashboard from every other planning tool. This document explores why simulation is valuable, what scenarios it unlocks, and how each maps onto the canvas.

---

## What "Simulation" Means Here

A simulation in AI Dashboard is a **workflow execution** where:
- Input/Assumption nodes supply variable values (single values, ranges, or distributions)
- AI nodes reason about those values using domain knowledge and live data from MCPs
- Calculator nodes compute deterministic math
- The run produces structured outputs at every node, visible in real time on the canvas
- Optionally, the workflow runs N times with sampled inputs (Monte Carlo) to produce distributions rather than point estimates

The result is not just a number — it is a **traced reasoning path** you can inspect, a set of values you can compare across scenarios, and a record of what data and logic produced them.

---

## Why Simulation Changes Planning

### The old way
1. Sketch a plan in a whiteboard tool
2. Export to a spreadsheet for estimation
3. Build a separate slide deck for stakeholders
4. Argue about assumptions in a meeting
5. Change one number, rebuild three documents

### The new way
1. Build the plan in AI Dashboard
2. Attach Input nodes for assumptions
3. Attach AI nodes for reasoning and MCP nodes for live data
4. Press Execute — the canvas shows results in real time
5. Change one Input node value — re-run in seconds
6. Show stakeholders the live canvas instead of a slide deck

Simulation makes plans **falsifiable**. Instead of debating an estimate, you simulate it and see where the uncertainty actually lives.

---

## Simulation Use Cases by Domain

### Software / Product Planning

**Feature cost and timeline estimation**
- Input nodes: team size, velocity, feature complexity
- AI node: Effort Estimator → outputs story points with confidence range
- AI node: Timeline Estimator → outputs end date given team calendar
- Calculator node: converts story points to cost using labor rates
- Chart node: renders cost range as a bar chart
- *Why simulation:* PMs can change velocity assumptions and immediately see how the launch date shifts

**Build-vs-buy decision**
- Input nodes: build cost, buy cost, maintenance cost per year, time horizon
- AI node: ROI Calculator → outputs NPV and payback for both options
- AI node: Decision Recommender → outputs recommendation with sensitivity analysis
- *Why simulation:* stakeholders can slide the "vendor price increase" assumption and watch the recommendation flip

**Capacity planning**
- Input nodes: planned roadmap items, team headcount, sprint length
- AI node: Effort Estimator per item
- Calculator node: sums estimates, compares against available sprints
- AI node: Risk Scorer flags items that have high uncertainty
- Chart node: renders a burn-up projection
- *Why simulation:* immediately reveals whether the roadmap is achievable before any commitments are made

---

### Construction Project Planning

**Budget burn simulation**
- MCP Data node: pulls committed costs and schedule from Trimble Viewpoint
- Input node: contingency reserve percentage
- AI node: Project Health Checker → assesses cost-at-completion risk
- AI node: Trend Analyzer → forecasts monthly burn rate
- Calculator node: computes months-to-depletion of contingency
- *Why simulation:* project controllers can see exactly when the contingency reserve runs out under different burn scenarios

**Schedule risk analysis**
- MCP Data node: pulls baseline schedule from Trimble Connect
- Input node: weather disruption days per month (range)
- AI node: Timeline Estimator → adjusts completion date
- Monte Carlo mode: run 1,000 iterations sampling weather disruption distribution
- Chart node: renders completion date as a probability distribution
- *Why simulation:* replaces a static schedule with a probabilistic forecast — "there's a 70% chance we finish before Oct 15"

**Subcontractor scope estimation**
- Input nodes: scope quantities from BIM model (can be a future MCP)
- AI node: Cost Estimator using labor rates from test MCP
- Calculator node: applies regional productivity factors
- AI node: Risk Scorer for scope gaps
- *Why simulation:* estimators can see how unit price uncertainty propagates to total bid cost

**Clash detection impact assessment**
- MCP Data node: pulls clash counts by discipline from Tekla
- AI node: BIM Clash Summarizer → estimates rework hours per discipline
- Calculator node: converts rework hours to cost and schedule impact
- AI node: Decision Recommender → suggests which discipline to resolve first
- *Why simulation:* BIM managers can quantify the cost of unresolved clashes before coordination meetings

---

### Process & Operations

**Incident response tabletop**
- Input nodes: incident severity, affected systems, time-to-detect
- AI node: Risk Scorer → estimates blast radius and MTTR
- AI node: Action Item Extractor → generates response checklist from an incident runbook Knowledge node
- *Why simulation:* teams can walk through hypothetical incidents before they happen, validating their runbooks against realistic parameters

**Hiring and onboarding capacity**
- Input nodes: planned hire count, ramp time per role, current team size
- AI node: Timeline Estimator → models when new hires reach full productivity
- Calculator node: models fully-loaded cost of hires over 12 months
- AI node: Decision Recommender → recommends hiring timeline that minimizes productivity dip
- *Why simulation:* HR and finance can align on a hire schedule that doesn't starve project delivery capacity

**Procurement and supply chain**
- Input nodes: lead times, buffer stock levels, demand forecast
- AI node: Trend Analyzer → forecasts demand
- Calculator node: computes reorder points
- AI node: Risk Scorer → flags supply disruption scenarios
- *Why simulation:* procurement teams can model stockout risk under different demand scenarios without building a spreadsheet

---

### Business Strategy

**Market expansion ROI**
- Input nodes: TAM, expected market share, cost to enter, time horizon
- AI node: ROI Calculator → computes expected NPV per market
- AI node: Decision Recommender → ranks markets by adjusted expected value
- Monte Carlo mode: sample TAM and market share distributions
- Chart node: renders NPV distribution per market
- *Why simulation:* strategy teams can see which market entry assumptions drive the most variance in ROI

**Pricing model comparison**
- Input nodes: price points, expected conversion rates, churn rates
- AI node: Trend Analyzer on historical conversion data from a Knowledge Library
- Calculator nodes: LTV, CAC, gross margin per pricing tier
- AI node: Scenario Comparator → compares tiers across LTV/CAC ratio
- *Why simulation:* product and finance can jointly explore how price sensitivity affects unit economics

**Resource allocation across projects**
- Input nodes: available FTE budget, list of projects, each with priority and effort estimate
- AI node: Effort Estimator per project
- Calculator node: total FTE demand vs supply
- AI node: Decision Recommender → suggests allocation to maximize strategic value
- *Why simulation:* portfolios can be rebalanced in minutes, not weeks of spreadsheet reconciliation

---

### Trimble-Specific Industry Scenarios

**Fleet routing and logistics (Trimble Maps MCP)**
- Input nodes: depot location, delivery stops, time windows
- MCP Data node: pulls traffic and route data from Trimble Maps
- AI node: Route Optimizer Summary
- Calculator node: fuel cost per route
- *Why simulation:* logistics planners can compare routing scenarios and see cost and time implications before dispatching

**Land development feasibility (future Geospatial MCP)**
- Input nodes: parcel size, zoning constraints, target unit count
- MCP Data node: pulls zoning and infrastructure data
- AI node: Cost Estimator using construction cost benchmarks
- AI node: Risk Scorer for regulatory risk
- Calculator node: pro forma returns
- *Why simulation:* developers can quickly screen parcels before committing to due diligence

**Agricultural season planning (future Agriculture MCP)**
- Input nodes: crop type, field acreage, target yield
- MCP Data node: pulls weather and soil data from Trimble Agriculture MCP
- AI node: Trend Analyzer on historical yield data
- AI node: Risk Scorer for weather and market risk
- Calculator node: expected revenue vs input cost
- *Why simulation:* farm managers can plan the season with AI-informed forecasts before planting

---

## Monte Carlo Specifically

Monte Carlo simulation is activated when one or more Input/Assumption nodes are configured as a **distribution** rather than a point value (min/max/most-likely).

The flow:
1. The Monte Carlo Setup Agent generates N sample sets across all distribution inputs
2. The simulation engine runs the full workflow N times in parallel batches, each with a different sample set
3. AI nodes run with each input sample (using the same compiled agent config — no re-provisioning)
4. Results aggregate per node: mean, P10, P50, P90, standard deviation
5. Chart nodes render output distributions instead of single values

This is the only way to answer questions like:
- "What is our 90th-percentile project cost?" rather than "what is our best estimate?"
- "What is the probability that we finish on time?" rather than "when do we finish?"
- "Which assumption drives the most variance in ROI?" (sensitivity analysis from distribution widths)

The key reason this works without excessive LLM cost: the agent's config is compiled once; each simulation run invokes the agent with different input values, not with a new agent configuration.

---

## Simulation as a Collaboration Tool

Beyond getting answers, simulation changes how teams collaborate:

- **Shared assumptions**: everyone sees the same Input nodes — no hidden spreadsheet assumptions
- **Reproducible runs**: every execution is stored with its inputs and outputs; teams can compare "last week's estimate" against "today's estimate" and see exactly what changed
- **Real-time stakeholder engagement**: instead of presenting a finished slide, show the live canvas during the meeting and change assumptions in response to questions
- **Audit trail**: the run history with all intermediate node values is browsable in Trimble Assist as well as on the canvas
