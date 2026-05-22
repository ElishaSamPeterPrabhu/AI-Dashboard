import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { config } from '../config.js';
import { createMcpServer } from './mcp-server.js';
import { SessionManager } from './session-manager.js';

export function setupHealthRoute(app: Express): void {
  app.get('/status/ready', (_req, res) => {
    res.json({ status: 'ok', service: config.server.name, version: config.server.version });
  });
  // Also expose /api/health for compatibility with Amplify VITE_API_BASE
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: config.server.name });
  });
  // Expose /api/latest-workflow for MCP App canvas fallback
  app.get('/api/latest-workflow', (_req, res) => {
    const { store } = require('../store/store.js') as typeof import('../store/store.js');
    res.json(store.getLatestWorkflow() ?? { workflowId: null, projectId: null });
  });
}

export function setupMcpRoutes(app: Express, sessions: SessionManager): void {
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    try {
      let transport: StreamableHTTPServerTransport;
      if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: newSessionId => {
            console.log(`Session initialized: ${newSessionId}`);
            sessions.set(newSessionId, transport);
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions.has(sid)) { sessions.delete(sid); }
        };
        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID' }, id: null });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });

  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) { res.status(400).send('Invalid or missing session ID'); return; }
    await sessions.get(sessionId)!.handleRequest(req, res);
  });

  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) { res.status(400).send('Invalid or missing session ID'); return; }
    try { await sessions.get(sessionId)!.handleRequest(req, res); }
    catch (error) { console.error('Error terminating session:', error); if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }); }
  });
}
