/**
 * Test workflow: "Capacity Planning"
 * Receives adjusted_cost + risk_summary from the Feature Cost Estimation connector,
 * then plans sprint capacity based on that budget.
 */
export const TEST_WORKFLOW_WF2 = {
  id: "test-capacity-planning",
  name: "Capacity Planning",
  nodes: [
    {
      id: "trigger-cap",
      type: "trigger",
      position: { x: 300, y: 30 },
      width: 160,
      data: {
        label: "Start Planning",
        triggerType: "manual",
        estimatedDuration: 0,
        executionResult: "Triggered",
      },
    },
    {
      id: "input-budget",
      type: "input",
      position: { x: 120, y: 170 },
      width: 160,
      data: {
        label: "Adjusted Budget",
        description: "adjusted_cost",   // matches connector output key
        dataType: "number",
        value: "",                       // pre-populated by connector
        estimatedDuration: 0,
      },
    },
    {
      id: "input-risk",
      type: "input",
      position: { x: 310, y: 170 },
      width: 160,
      data: {
        label: "Risk Context",
        description: "risk_summary",    // matches connector output key
        dataType: "string",
        value: "",
        estimatedDuration: 0,
      },
    },
    {
      id: "calc-sprints",
      type: "calculator",
      position: { x: 200, y: 340 },
      width: 160,
      data: {
        label: "Sprint Budget",
        formula: "adjusted_cost / 67200",   // how many sprint-equivalents can we afford
        estimatedDuration: 0,
      },
    },
    {
      id: "ai-capacity",
      type: "ai",
      position: { x: 200, y: 490 },
      width: 160,
      data: {
        label: "Capacity Planner",
        description:
          "Given the adjusted budget and risk context, plan the number of sprints and team allocation. Use the run_script tool to calculate sprint count from budget.",
        agentId: "17d7e361-50a2-43fb-87dc-f1367485a8cf",
        agentName: "Risk Estimator",
        status: "idle",
        estimatedDuration: 3,
      },
    },
    {
      id: "output-plan",
      type: "output",
      position: { x: 200, y: 650 },
      width: 160,
      data: {
        label: "Capacity Plan",
        description: "adjusted_cost",
        format: "text",
        estimatedDuration: 0,
      },
    },
  ],

  edges: [
    { id: "e-cap-t-budget", source: "trigger-cap",   target: "input-budget" },
    { id: "e-cap-t-risk",   source: "trigger-cap",   target: "input-risk" },
    { id: "e-cap-b-calc",   source: "input-budget",  target: "calc-sprints" },
    { id: "e-cap-b-ai",     source: "calc-sprints",  target: "ai-capacity" },
    { id: "e-cap-r-ai",     source: "input-risk",    target: "ai-capacity" },
    { id: "e-cap-ai-out",   source: "ai-capacity",   target: "output-plan" },
  ],
} as const;
