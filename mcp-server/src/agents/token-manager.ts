// Agent token manager — ported from server/src/main.ts
// Fetches a machine token via client_credentials and auto-refreshes every 45 min.

import { createRequire } from 'module';
import { config } from '../config.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const https = require('https') as typeof import('https');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const qs = require('querystring') as typeof import('querystring');

let _apiKey = '';

export function getApiKey(): string { return _apiKey; }
export function setApiKey(key: string): void { _apiKey = key; }

async function fetchMachineToken(): Promise<string> {
  const { clientId, clientSecret } = config.agent;
  if (!clientId || !clientSecret) throw new Error('CLIENT_ID or CLIENT_SECRET not set');

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = qs.stringify({ grant_type: 'client_credentials', scope: 'agents' });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'id.trimble.com',
        path: '/oauth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { access_token?: string; error?: string };
            if (json.access_token) resolve(json.access_token);
            else reject(new Error(json.error ?? 'No access_token'));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function refreshToken(log = true): Promise<void> {
  try {
    const token = await fetchMachineToken();
    _apiKey = token;
    if (log) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as { exp?: number; scope?: string };
        const exp = payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown';
        console.log(`Machine token refreshed — scope: ${payload.scope} | expires: ${exp}`);
      } catch { console.log('Machine token refreshed'); }
    }
  } catch (err) {
    console.warn(`Token refresh failed: ${(err as Error).message}`);
  }
}

export async function initTokenManager(): Promise<void> {
  // Use existing valid JWT from env if present, otherwise fetch machine token
  const envKey = process.env.TRIMBLE_AGENT_API_KEY;
  if (envKey) {
    try {
      const p = JSON.parse(Buffer.from(envKey.split('.')[1], 'base64').toString()) as { exp?: number };
      if (p.exp && p.exp * 1000 > Date.now()) {
        _apiKey = envKey;
        console.log('Using existing token from env (still valid)');
        // Still schedule refresh so it doesn't expire mid-session
        scheduleRefresh();
        return;
      }
    } catch { /* not a JWT */ }
  }
  await refreshToken();
  scheduleRefresh();
}

function scheduleRefresh(): void {
  setInterval(() => {
    const key = _apiKey;
    let stillValid = false;
    if (key) {
      try {
        const p = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()) as { exp?: number };
        stillValid = Boolean(p.exp && p.exp * 1000 > Date.now() + 5 * 60 * 1000);
      } catch { /* not a JWT */ }
    }
    if (!stillValid) void refreshToken(false);
  }, 5 * 60 * 1000);
}
