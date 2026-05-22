import 'dotenv/config';
import {
  ClientCredentialTokenProvider,
  OpenIdEndpointProvider,
} from '@trimble-oss/trimble-id';

/**
 * Fetches a real TID access token using client credentials.
 * TOKEN_ISSUER_URL must point at the real issuer (e.g. https://id.trimble.com).
 * CLIENT_ID / CLIENT_SECRET are the TID confidential-client credentials.
 * E2E_OAUTH_SCOPE is the scope registered for this MCP server in the TID console
 *   (found in .env.example — defaults to CLIENT_ID if unset).
 */
export async function getValidE2EToken(): Promise<string> {
  const discoveryUrl = `${process.env.TOKEN_ISSUER_URL}/.well-known/openid-configuration`;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const scope = process.env.E2E_OAUTH_SCOPE ?? clientId;

  if (!clientId || !clientSecret) {
    throw new Error('Missing CLIENT_ID or CLIENT_SECRET in environment for E2E tests.');
  }
  if (!scope) {
    throw new Error('Missing E2E_OAUTH_SCOPE (or CLIENT_ID as fallback) for E2E tests.');
  }

  const endpointProvider = new OpenIdEndpointProvider(discoveryUrl);
  const tokenProvider = new ClientCredentialTokenProvider(
    endpointProvider,
    clientId,
    clientSecret,
  ).WithScopes([scope]);

  try {
    return await tokenProvider.RetrieveToken();
  } catch (error) {
    console.error('Failed to retrieve TID token for E2E tests:', error);
    throw error;
  }
}
