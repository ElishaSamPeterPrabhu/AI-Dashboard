/**
 * Test workflow: "Feature Cost Estimation"
 * Simulates what an AI will generate in the future.
 * Priority determines execution order; estimatedDuration is in seconds.
 * executionResult is the mocked output shown after a node finishes.
 */
export const TEST_WORKFLOW = {
  id: "test-feature-cost",
  name: "Feature Cost Estimation",
  nodes: [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 300, y: 30 },
      width: 160,
      data: {
        label: "Start Estimation",
        triggerType: "manual",
        priority: 1,
        estimatedDuration: 0,
        executionResult: "Triggered",
      },
    },
    {
      id: "input-team",
      type: "input",
      position: { x: 60, y: 170 },
      width: 160,
      data: {
        label: "Team Size",
        description: "teamSize",
        dataType: "number",
        value: "10",
        priority: 2,
        estimatedDuration: 0,
        executionResult: "10",
      },
    },
    {
      id: "input-velocity",
      type: "input",
      position: { x: 250, y: 170 },
      width: 160,
      data: {
        label: "Sprint Velocity",
        description: "velocity",
        dataType: "number",
        value: "42",
        priority: 2,
        estimatedDuration: 0,
        executionResult: "42",
      },
    },
    {
      id: "db-rates",
      type: "database",
      position: { x: 440, y: 170 },
      width: 160,
      data: {
        label: "Rate Table",
        description: "Engineering labor rates by role",
        entries: [
          { key: "engineerDailyRate", value: "800" },
          { key: "currency", value: "USD" },
        ],
        priority: 2,
        estimatedDuration: 0,
        executionResult: "{ engineerDailyRate: 800 }",
      },
    },
    {
      id: "calc-cost",
      type: "calculator",
      position: { x: 180, y: 340 },
      width: 160,
      data: {
        label: "Cost Formula",
        formula: "teamSize * velocity * engineerDailyRate / 5",
        priority: 3,
        estimatedDuration: 1,
        executionResult: "$102,400",
      },
    },
    {
      id: "assumption-buffer",
      type: "assumption",
      position: { x: 380, y: 340 },
      width: 160,
      data: {
        label: "Risk Buffer",
        description: "riskBuffer",
        distribution: "triangular",
        min: 0.05,
        max: 0.25,
        mostLikely: 0.15,
        priority: 3,
        estimatedDuration: 0,
        executionResult: "0.15 (15%)",
      },
    },
    {
      id: "ai-risk",
      type: "ai",
      position: { x: 120, y: 500 },
      width: 160,
      data: {
        label: "Risk Estimator",
        description:
          "Analyse team size, velocity, and cost to estimate delivery risk and recommend mitigation strategies.",
        agentId: "17d7e361-50a2-43fb-87dc-f1367485a8cf",
        agentName: "Risk Estimator",
        status: "idle",
        priority: 4,
        estimatedDuration: 3,
        executionResult: "Medium risk (15%). Recommend adding 2-week buffer sprint.",
      },
    },
    {
      id: "decision-budget",
      type: "decision",
      position: { x: 370, y: 490 },
      width: 110,
      height: 110,
      data: {
        label: "In Budget?",
        trueLabel: "Approved",
        falseLabel: "Revise",
        priority: 5,
        estimatedDuration: 0,
        executionResult: "Yes → Approved",
      },
    },
    {
      id: "output-estimate",
      type: "output",
      position: { x: 180, y: 680 },
      width: 160,
      data: {
        label: "Final Estimate",
        description: "adjusted_cost",
        format: "currency",
        priority: 6,
        estimatedDuration: 0,
      },
    },
    {
      id: "output-risk",
      type: "output",
      position: { x: 380, y: 680 },
      width: 160,
      data: {
        label: "Risk Summary",
        description: "risk_summary",
        format: "text",
        priority: 6,
        estimatedDuration: 0,
        executionResult: "Medium risk · 15% buffer recommended",
      },
    },
    {
      id: "connector-wf2",
      type: "connector",
      position: { x: 220, y: 840 },
      width: 160,
      data: {
        label: "Phase 2: Capacity Planning",
        sectionName: "Capacity Planning",
        description: "Pass adjusted cost and risk summary to capacity planning section",
        agentId: "",
      },
    },
  ],

  edges: [
    // Trigger fans out to inputs
    { id: "e-t-team",     source: "trigger-1",  target: "input-team" },
    { id: "e-t-vel",      source: "trigger-1",  target: "input-velocity" },
    { id: "e-t-db",       source: "trigger-1",  target: "db-rates" },
    // Inputs into calculator
    { id: "e-team-calc",  source: "input-team",     target: "calc-cost" },
    { id: "e-vel-calc",   source: "input-velocity", target: "calc-cost" },
    { id: "e-db-calc",    source: "db-rates",        target: "calc-cost" },
    // Calculator + Assumption into AI
    { id: "e-calc-ai",    source: "calc-cost",       target: "ai-risk" },
    { id: "e-buf-ai",     source: "assumption-buffer", target: "ai-risk" },
    // Calculator into Decision
    { id: "e-calc-dec",   source: "calc-cost",       target: "decision-budget" },
    // AI into outputs
    { id: "e-ai-out",     source: "ai-risk",         target: "output-estimate" },
    { id: "e-ai-risk",    source: "ai-risk",         target: "output-risk" },
    // Decision to outputs
    { id: "e-dec-out",    source: "decision-budget", sourceHandle: "default", target: "output-estimate" },
    // Outputs into connector
    { id: "e-out-conn",   source: "output-estimate", target: "connector-wf2" },
    { id: "e-risk-conn",  source: "output-risk",     target: "connector-wf2" },
  ],
} as const;
