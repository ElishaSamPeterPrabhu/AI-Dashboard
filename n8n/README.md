# AI Dashboard — n8n MCP Server Setup

## Import order

**Step 1**: Import `1_ai_dashboard_build_workflow.json`
- Go to n8n → Workflows → Import from File
- Note the workflow ID shown in the URL after import (e.g. `xYzAbC123`)

**Step 2**: Edit `2_AI_Dashboard_MCP.json`
- Open the file and replace `REPLACE_WITH_SUBWORKFLOW_ID` with the ID from Step 1

**Step 3**: Import `2_AI_Dashboard_MCP.json`

**Step 4**: Activate both workflows (toggle to Active)

---

## n8n Variable to set

Go to **n8n → Variables** and add:

| Name | Value |
|------|-------|
| `AI_DASHBOARD_BFF_URL` | `https://your-bff-url.com` (or `http://localhost:3000` for local test) |

---

## Your MCP endpoint URL

Once active, your MCP server is at:
```
https://<your-n8n-instance>/mcp/ai-dashboard-mcp
```

Register this URL in **Trimble Assist → Tools → Add MCP Server**.

---

## What the tool does

When Trimble Assist calls `build_workflow`:

1. n8n receives the call with `prompt`, optional `threadId`, optional `workflowId`
2. n8n POSTs to `{AI_DASHBOARD_BFF_URL}/api/demo/run`
3. BFF calls AI Planner agent → Workflow_Builder sub-agent → builds canvas
4. Returns:
   - `result` — human-readable summary shown in Trimble Assist chat
   - `canvasUrl` — link to the interactive React canvas (e.g. `https://your-bff/canvas/wf-abc123`)
   - `threadId` — pass back on next message for multi-turn conversation
   - `workflowId` — pass back to edit the workflow

---

## Testing locally

With the BFF running at `localhost:3000`, test the sub-workflow directly in n8n:
- Open `ai_dashboard_build_workflow`
- Click the trigger node → Edit → set test input:
  ```json
  { "prompt": "Sprint plan for team 8, velocity 42", "threadId": "", "workflowId": "" }
  ```
- Click **Test workflow**
