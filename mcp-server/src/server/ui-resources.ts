import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { WORKFLOW_CANVAS_RESOURCE_URI, getCanvasAppHtml } from '../tools/workflow-tools.js';

export function registerUiResources(server: McpServer): void {
  registerAppResource(
    server,
    'Workflow Canvas',
    WORKFLOW_CANVAS_RESOURCE_URI,
    {
      description: 'Interactive workflow canvas showing nodes, types, and execution results. Embeds the React Flow editor.',
    },
    async () => ({
      contents: [
        {
          uri: WORKFLOW_CANVAS_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: getCanvasAppHtml(),
        },
      ],
    })
  );
}
