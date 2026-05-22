import {
  createRemoteJWKSet,
  jwtVerify,
  decodeJwt,
  errors as joseErrors,
  type JWTPayload,
} from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

import { config } from '../config.js';

const DEBUG = process.env.DEBUG_AUTH === '1';

const JWKS = createRemoteJWKSet(new URL(config.auth.jwksUrl), {
  cacheMaxAge: 600000,
  cooldownDuration: 30000,
});

export class BearerTokenVerifier implements OAuthTokenVerifier {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (DEBUG) {
      try {
        const claims = decodeJwt(token);
        console.log('[DEBUG_AUTH] token claims:', JSON.stringify({
          iss: claims.iss,
          aud: claims.aud,
          azp: (claims as Record<string, unknown>).azp,
          sub: claims.sub,
          scope: (claims as Record<string, unknown>).scope,
          exp: claims.exp,
        }));
        console.log('[DEBUG_AUTH] expected issuer:', config.auth.tokenIssuerUrl);
        console.log('[DEBUG_AUTH] expected audience:', config.auth.authZ);
      } catch {
        console.log('[DEBUG_AUTH] could not decode token (not a JWT?)');
      }
    }

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, JWKS, {
        issuer: config.auth.tokenIssuerUrl,
        audience: config.auth.authZ,
      });
      payload = result.payload;
    } catch (error) {
      if (DEBUG) {
        const name = error instanceof Error ? error.constructor.name : 'unknown';
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`[DEBUG_AUTH] jwtVerify failed: ${name} — ${msg}`);
      }
      if (error instanceof joseErrors.JWTExpired) {
        throw new InvalidTokenError('Token has expired');
      }
      if (error instanceof joseErrors.JWTClaimValidationFailed) {
        throw new InvalidTokenError(`Token validation failed: ${error.message}`);
      }
      if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
        throw new InvalidTokenError('Invalid token signature');
      }
      if (error instanceof joseErrors.JWTInvalid) {
        throw new InvalidTokenError('Invalid token format');
      }
      throw new InvalidTokenError('Token verification failed');
    }

    const clientId =
      payload.azp ??
      (payload as JWTPayload & { client_id?: string }).client_id ??
      payload.sub;

    if (!clientId || typeof clientId !== 'string') {
      throw new InvalidTokenError('Missing client identifier (azp, client_id, or sub claim)');
    }

    const scopes =
      typeof payload.scope === 'string' ? payload.scope.split(' ') : [];

    return { token, clientId, scopes, expiresAt: payload.exp };
  }
}
