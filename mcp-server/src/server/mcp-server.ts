import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { config } from '../config.js';
import { allTools } from '../tools/index.js';
import { registerUiResources } from './ui-resources.js';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: config.server.name, version: config.server.version },
    { capabilities: { tools: {}, resources: {} } }
  );

  registerUiResources(server);

  for (const [name, tool] of Object.entries(allTools)) {
    const uiResourceUri = tool._meta?.ui?.resourceUri;
    if (uiResourceUri !== undefined) {
      registerAppTool(
        server,
        name,
        { description: tool.description, inputSchema: tool.inputSchema, _meta: { ui: { resourceUri: uiResourceUri } } },
        async (args): Promise<CallToolResult> => tool.handler(args)
      );
    } else {
      server.registerTool(
        name,
        { description: tool.description, inputSchema: tool.inputSchema },
        async (args): Promise<CallToolResult> => tool.handler(args)
      );
    }
  }

  return server;
}
