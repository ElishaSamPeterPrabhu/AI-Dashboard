#!/usr/bin/env node
import 'dotenv/config';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { config } from './config.js';
import { createAuthMiddleware, setupAuthRoutes, fetchOAuthMetadata } from './auth/index.js';
import { SessionManager, setupHealthRoute, setupMcpRoutes } from './server/index.js';
import { initTokenManager } from './agents/token-manager.js';

const sessions = new SessionManager();

async function main() {
  // Init Trimble Agent Service token (machine token or env JWT)
  await initTokenManager();

  const oauthMetadata = await fetchOAuthMetadata();
  const app = createMcpExpressApp({ host: '0.0.0.0' });

  setupAuthRoutes(app, oauthMetadata);
  setupHealthRoute(app);

  app.use('/mcp', createAuthMiddleware());
  setupMcpRoutes(app, sessions);

  app.listen(config.server.port, () => {
    console.log(`AI Dashboard MCP server running at http://localhost:${config.server.port}/mcp`);
    console.log(`Health: http://localhost:${config.server.port}/status/ready`);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

const shutdown = async () => {
  await sessions.closeAll();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
