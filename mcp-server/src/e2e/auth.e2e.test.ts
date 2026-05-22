import { describe, it, expect, beforeAll } from 'vitest';
import { getValidE2EToken } from './auth.js';

/**
 * E2E auth tests against the deployed MCP server.
 *
 * Run with:
 *   npm run test:e2e
 *
 * Required env (copy from .env.example and fill in):
 *   TOKEN_ISSUER_URL=https://id.trimble.com
 *   CLIENT_ID=<your TID confidential client id>
 *   CLIENT_SECRET=<your TID confidential client secret>
 *   E2E_OAUTH_SCOPE=<scope registered for this MCP app in TID console>
 *   E2E_BASE_URL=https://ca-eus-tmp-ai-dashboard-mcp.victorioussmoke-3ce457d0.eastus2.azurecontainerapps.io
 *
 * What these tests verify (and what Studio's "Add Connector" validation does):
 *   1. Unauthenticated POST /mcp → 401 with WWW-Authenticate header (OAuth discovery challenge).
 *   2. POST /mcp with garbage token → 401.
 *   3. POST /mcp initialize with a real TID token → 200 + mcp-session-id.
 *   4. POST /mcp tools/list with the session → 200 + non-empty tool list.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4000';

const initBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '1.0.0' },
  },
});

describe('MCP auth E2E', () => {
  let validToken: string;
  let sessionId: string;

  beforeAll(async () => {
    validToken = await getValidE2EToken();
  });

  it('returns 401 without a token and includes WWW-Authenticate header', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: initBody,
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/Bearer/i);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer not-a-real-token',
      },
      body: initBody,
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 + mcp-session-id with a valid token (initialize)', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${validToken}`,
      },
      body: initBody,
    });
    expect(res.status).toBe(200);
    sessionId = res.headers.get('mcp-session-id') ?? '';
    expect(sessionId).toBeTruthy();
  });

  it('returns 200 + non-empty tool list (tools/list)', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${validToken}`,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"tools"');
  });
});
