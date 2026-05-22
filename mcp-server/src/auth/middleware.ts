import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Express } from 'express';

import { config } from '../config.js';
import { BearerTokenVerifier } from './token-verifier.js';

export async function fetchOAuthMetadata(): Promise<OAuthMetadata> {
  const response = await fetch(config.auth.discoveryUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OIDC discovery: ${response.status} ${response.statusText}`
    );
  }
  return response.json() as Promise<OAuthMetadata>;
}

export function createAuthMiddleware() {
  return requireBearerAuth({
    verifier: new BearerTokenVerifier(),
    resourceMetadataUrl: `${config.resourceServerUrl}/.well-known/oauth-protected-resource/mcp`,
  });
}

export function setupAuthRoutes(app: Express, oauthMetadata: OAuthMetadata) {
  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl: new URL(`${config.resourceServerUrl}/mcp`),
      resourceName: config.server.name,
    })
  );
}
