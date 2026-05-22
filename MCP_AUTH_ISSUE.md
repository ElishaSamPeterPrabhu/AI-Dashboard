# Trimble-Agentic MCP — Studio "Failed to discover MCP tools" — Root Cause & Fix

## Status: FIXED (pending deploy)

The deployed `ai-dashboard-mcp` container was started with **no env vars at all** —
`JWT_AUDIENCE`, `OAUTH_SERVER_URL`, and `TOKEN_ISSUER_URL` were defined in
`MCP_AUTH_ISSUE.md` but were never wired into `agentic-mcp-config.yaml`, so every
environment variable was undefined in the running container. This caused three layered failures:

1. **`JWT_AUDIENCE` not required** — Our `config.ts` had dropped `requiredEnv('JWT_AUDIENCE')`,
   so the server started silently without the audience configured.
2. **No `aud` check in token verifier** — Our `token-verifier.ts` called `jwtVerify` without
   `audience:`, so even if Studio obtained a correctly-scoped token the server would have
   accepted any audience. But more importantly, the *protected-resource metadata* that Studio
   reads to know what audience to request was pointing at nothing useful.
3. **`discoveryUrl` from wrong env** — Our `config.ts` derived discovery from
   `TOKEN_ISSUER_URL` (real TID, no `registration_endpoint`) instead of `OAUTH_SERVER_URL`
   (the proxy that has `registration_endpoint` for Studio's DCR handshake).

Additionally, `TOKEN_ISSUER_URL` in the deployment config had been incorrectly set to the
proxy URL (`id-mcp.dev...`) instead of real TID (`id.trimble.com`), meaning the JWKS URL
was wrong and every signature verification would fail.

## What was fixed (PR on `feat/ai-dashboard-tools`)

| File | Change |
|---|---|
| `mcp-server/agentic-mcp-config.yaml` | Added all required `envVars` + `secrets`; `TOKEN_ISSUER_URL=https://id.trimble.com`, `OAUTH_SERVER_URL=https://id-mcp.dev.trimble-transportation.com`, `JWT_AUDIENCE=1c5cf54b-928a-4d78-a9f4-fd44a7cb8ddc` |
| `mcp-server/src/config.ts` | Restored `authZ: requiredEnv('JWT_AUDIENCE').split(',')...`; restored `discoveryUrl` from `oauthServerUrl` (not `tokenIssuerUrl`) |
| `mcp-server/src/auth/token-verifier.ts` | Restored `audience: config.auth.authZ` in `jwtVerify`; added `DEBUG_AUTH`-gated `decodeJwt` logging |
| `mcp-server/src/server/http-routes.ts` | Added `DEBUG_AUTH`-gated request logging (method, hasAuth, hasMcpSession, user-agent) |

`DEBUG_AUTH=1` is enabled in `agentic-mcp-config.yaml` temporarily so Container App logs
will surface decoded token claims and jose error class on any remaining failure.

## How Studio validation actually works

```
Studio → POST /mcp (no token)
  ← 401 WWW-Authenticate: Bearer resource_metadata=<url>
Studio → GET /.well-known/oauth-protected-resource/mcp
  ← { authorization_servers: ["https://id-mcp.dev..."], resource: "..." }
Studio → GET https://id-mcp.dev.../.well-known/openid-configuration
  ← { registration_endpoint, token_endpoint, ... }
Studio → POST /token (OBO actor token, audience=JWT_AUDIENCE)
  ← access_token (iss=id.trimble.com, aud=1c5cf54b-..., azp=StudioClient)
Studio → POST /mcp initialize + Bearer <token>
  ← 200 + mcp-session-id
Studio → POST /mcp tools/list + Bearer + session
  ← 200 + tools list
```

The `requireBearerAuth` middleware must stay global on `/mcp` — it is what emits
the `WWW-Authenticate` challenge that triggers Step 1. Do not bypass it for
`initialize` or `tools/list`.

## Why previous attempts failed

| Attempt | What it did | Why it still failed |
|---|---|---|
| Use template defaults | `discoveryUrl = TOKEN_ISSUER_URL/openid-configuration` | Real TID has no `registration_endpoint`; Studio's DCR failed |
| Add RESOURCE_SERVER_URL | Fixed metadata URL | iss/aud still wrong; no env vars in container |
| Switch discoveryUrl to proxy | Pointed at proxy for discovery | TOKEN_ISSUER_URL still set to proxy, so JWKS wrong |
| Set TOKEN_ISSUER_URL = proxy | Proxy is not real issuer; JWKS at proxy URL invalid | iss in tokens is id.trimble.com; signature fails |
| Allow initialize/tools/list without auth | Bypassed requireBearerAuth | Removed WWW-Authenticate challenge; Studio can't discover OAuth server |

## To verify after deploy

```bash
# 1. Tail logs while re-adding connector in Studio
az containerapp logs show \
  --name ca-eus-tmp-ai-dashboard-mcp \
  --resource-group <rg> \
  --follow --format text | grep DEBUG_AUTH

# 2. Run e2e tests against the deployed URL (requires CLIENT_ID/SECRET in .env)
cd mcp-server
npm install
E2E_BASE_URL=https://ca-eus-tmp-ai-dashboard-mcp.victorioussmoke-3ce457d0.eastus2.azurecontainerapps.io \
  npm run test:e2e
```

Expected e2e output:
- `POST /mcp (no token)` → 401 + `www-authenticate: Bearer ...`  ✓
- `POST /mcp (bad token)` → 401  ✓
- `POST /mcp initialize (valid token)` → 200 + `mcp-session-id`  ✓
- `POST /mcp tools/list (session)` → 200 + tools  ✓

## After confirmation

Remove `DEBUG_AUTH=1` from `agentic-mcp-config.yaml` and redeploy.

## Server

- Repo: https://github.com/Trimble-Agentic/ai-dashboard-mcp
- Branch: `feat/ai-dashboard-tools`
- Deployed URL: https://ca-eus-tmp-ai-dashboard-mcp.victorioussmoke-3ce457d0.eastus2.azurecontainerapps.io
- MCP endpoint: `/mcp`
- Protected-resource metadata: `/.well-known/oauth-protected-resource/mcp`
- Health: `/status/ready`
