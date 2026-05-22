import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

import { createWorkflowTools, createNodeTools } from './workflow-tools.js';

export interface ToolDefinition {
  description: string;
  inputSchema: z.ZodType;
  handler: (args: unknown) => Promise<CallToolResult>;
  _meta?: {
    ui?: { resourceUri: string };
    [key: string]: unknown;
  };
}

export const allTools: Record<string, ToolDefinition> = {
  ...createWorkflowTools(),
  ...createNodeTools(),
};
