// ai-dashboard Azure infrastructure
// Provisions: App Service Plan (B1) + App Service (NestJS BFF) + Static Web App (React UI)
// Deploy: az deployment group create -g ai-dashboard-rg --template-file azure/bicep/main.bicep

@description('Location for all resources')
param location string = resourceGroup().location

@description('Location for Static Web Apps (limited regions)')
param swaLocation string = 'eastus2'

@description('App name prefix (used for all resource names)')
param appName string = 'ai-dashboard'

@description('SKU for App Service Plan')
param appServiceSku string = 'F1'

// ── App Service Plan ─────────────────────────────────────────────────────────
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${appName}-plan'
  location: location
  sku: {
    name: appServiceSku
    tier: 'Free'
  }
  kind: 'linux'
  properties: {
    reserved: true  // required for Linux
  }
}

// ── App Service (NestJS BFF) ─────────────────────────────────────────────────
resource appService 'Microsoft.Web/sites@2023-01-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appCommandLine: 'node dist/main.js'
      appSettings: [
        { name: 'NODE_ENV',              value: 'production' }
        { name: 'PORT',                  value: '8080' }
        { name: 'BFF_PUBLIC_URL',        value: 'https://${appName}.azurewebsites.net' }
        { name: 'TRIMBLE_AGENT_BASE_URL',value: 'https://agents.ai.trimble.com' }
        // Set these manually after deployment (or use Key Vault references):
        // { name: 'TRIMBLE_AGENT_API_KEY',    value: '' }
        // { name: 'DEMO_PLANNER_AGENT_ID',    value: '' }
        // { name: 'WORKFLOW_BUILDER_AGENT_ID',value: '' }
        // { name: 'CLIENT_ID',                value: '' }
        // { name: 'CLIENT_SECRET',            value: '' }
      ]
      cors: {
        allowedOrigins: [
          'https://${staticWebApp.properties.defaultHostname}'
        ]
        supportCredentials: true
      }
    }
    httpsOnly: true
  }
}

// ── Static Web App (React UI) ────────────────────────────────────────────────
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: '${appName}-ui'
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      appLocation: '/'          // root of repo
      outputLocation: 'dist'    // Vite build output
      appBuildCommand: 'npm run build'
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output mcpEndpoint string = 'https://${appService.properties.defaultHostName}/mcp'
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
