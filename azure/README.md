# Azure Deployment — AI Dashboard

## One-time setup

```bash
# 1. Log in and create resource group
az login
az group create -n ai-dashboard-rg -l eastus

# 2. Deploy infrastructure
az deployment group create \
  -g ai-dashboard-rg \
  --template-file azure/bicep/main.bicep \
  --parameters @azure/bicep/main.parameters.json

# 3. Set secrets as App Settings (or use Key Vault references)
az webapp config appsettings set \
  -g ai-dashboard-rg -n ai-dashboard \
  --settings \
    TRIMBLE_AGENT_API_KEY="<token>" \
    DEMO_PLANNER_AGENT_ID="df7b36b9-328a-41a5-8cd8-73d80c37ac46" \
    WORKFLOW_BUILDER_AGENT_ID="61cbe03d-2d75-47af-89b5-bf9bb455f905" \
    CLIENT_ID="<client-id>" \
    CLIENT_SECRET="<client-secret>"
```

## GitHub Actions secrets needed

| Secret | Where to get it |
|--------|----------------|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Azure Portal → App Service → Deployment Center → Manage publish profile |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Output from Bicep deployment (`staticWebAppDeploymentToken`) |

## MCP endpoint for Trimble Assist registration

```
https://ai-dashboard.azurewebsites.net/mcp
```

## Endpoints

| URL | Purpose |
|-----|---------|
| `https://ai-dashboard.azurewebsites.net/mcp` | MCP Streamable HTTP (register in Trimble Assist) |
| `https://ai-dashboard.azurewebsites.net/api/*` | REST API (canvas, agents, demo) |
| `https://ai-dashboard-ui.azurestaticapps.net` | React UI |
