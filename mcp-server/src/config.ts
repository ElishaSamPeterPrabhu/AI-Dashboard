import 'dotenv/config';

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} environment variable is required`);
  return value;
}
function normalizeUrl(url: string): string { return url.replace(/\/+$/, ''); }

const oauthServerUrl = normalizeUrl(requiredEnv('OAUTH_SERVER_URL'));
const tokenIssuerUrl = normalizeUrl(requiredEnv('TOKEN_ISSUER_URL'));

export const config = {
  server: {
    port: Number(process.env.PORT ?? 4000),
    name: process.env.SERVER_NAME ?? 'ai-dashboard-mcp',
    version: process.env.VERSION ?? '1.0.0',
  },
  auth: {
    // Audiences the server accepts in the JWT 'aud' claim (comma-separated env var).
    authZ: requiredEnv('JWT_AUDIENCE')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    oauthServerUrl,
    // Discovery fetched from the OAuth proxy (has registration_endpoint for Studio).
    discoveryUrl: `${oauthServerUrl}/.well-known/openid-configuration`,
    tokenIssuerUrl,
    jwksUrl: `${tokenIssuerUrl}/.well-known/jwks.json`,
  },
  agent: {
    baseUrl: normalizeUrl(process.env.TRIMBLE_AGENT_BASE_URL ?? 'https://agents.ai.trimble.com'),
    demoPlannerId: process.env.DEMO_PLANNER_AGENT_ID ?? '',
    clientId: process.env.CLIENT_ID ?? '',
    clientSecret: process.env.CLIENT_SECRET ?? '',
  },
  ui: {
    publicUrl: normalizeUrl(process.env.UI_PUBLIC_URL ?? 'http://localhost:5173'),
  },
  get resourceServerUrl(): string {
    return normalizeUrl(process.env.RESOURCE_SERVER_URL ?? `http://localhost:${this.server.port}`);
  },
} as const;
