import crypto from 'node:crypto';
import { prisma } from '../prisma';
import { hashCredential, generateCredential } from '../security/secrets';
import { apiScopes, ApiScope } from '../api-v1';

export const OAUTH_ACCESS_TOKEN_TTL_MS = 60 * 60_000; // 1 hour
export const OAUTH_REFRESH_TOKEN_TTL_MS = 30 * 24 * 3600_000; // 30 days
export const OAUTH_CODE_TTL_MS = 5 * 60_000; // 5 minutes

export const OAuthErrors = {
  invalidRequest: (desc: string) => ({ error: 'invalid_request', error_description: desc }),
  invalidClient: (desc = 'Client authentication failed.') => ({ error: 'invalid_client', error_description: desc }),
  invalidGrant: (desc: string) => ({ error: 'invalid_grant', error_description: desc }),
  unsupportedGrantType: () => ({ error: 'unsupported_grant_type', error_description: 'Only authorization_code and refresh_token are supported.' }),
  invalidScope: (desc: string) => ({ error: 'invalid_scope', error_description: desc }),
  serverError: () => ({ error: 'server_error', error_description: 'Unexpected server error.' }),
};

/** RFC 7636 S256 challenge: BASE64URL(SHA256(verifier)) without padding. */
export function pkceChallenge(verifier: string) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function validPkceVerifier(verifier: string) {
  return /^[A-Za-z0-9-._~]{43,128}$/.test(verifier);
}

/** Exact-match redirect URI validation (RFC 6819: no substring/prefix matching). */
export function redirectUriAllowed(allowed: string[], candidate: string) {
  return allowed.includes(candidate);
}

/** Scopes are clamped to the fixed public scope list — never platform-admin abilities. */
export function clampScopes(requested: string[], clientScopes: string[]): ApiScope[] {
  const client = new Set(clientScopes);
  const valid = new Set<string>(apiScopes);
  return requested.filter((s) => valid.has(s) && client.has(s)) as ApiScope[];
}

export function parseScopeParam(scope: string | null | undefined) {
  if (!scope) return [];
  return scope.split(/\s+/).filter(Boolean);
}

export function newAuthorizationCode() {
  return generateCredential('nova_ac');
}

export function newAccessToken() {
  return generateCredential('nova_at');
}

export function newRefreshToken() {
  return generateCredential('nova_rt');
}

export function newClientCredentials() {
  return { clientId: `nova_c_${crypto.randomBytes(12).toString('base64url')}`, clientSecret: generateCredential('nova_cs') };
}

type AuthorizeInput = {
  clientId: string;
  redirectUri: string;
  scope: string[];
  codeChallenge: string;
  challengeMethod: string;
};

type AuthorizeResult =
  | { ok: false; error: 'unauthorized_client' | 'invalid_request' | 'invalid_scope'; message: string }
  | { ok: true; code: string; granted: ApiScope[]; applicationName: string };

/** Validates an authorization request and (after user consent) stores the code. */
export async function createAuthorization(input: AuthorizeInput, userId: string, workspaceId: string | null): Promise<AuthorizeResult> {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: input.clientId }, select: { id: true, redirectUris: true, scopes: true, status: true, application: { select: { status: true, name: true } } } });
  if (!client || client.status !== 'ACTIVE' || client.application.status !== 'ACTIVE') return { ok: false, error: 'unauthorized_client', message: 'This application is not authorized.' };
  if (!redirectUriAllowed(client.redirectUris, input.redirectUri)) return { ok: false, error: 'invalid_request', message: 'redirect_uri does not exactly match a registered redirect URI.' };
  if (input.challengeMethod !== 'S256') return { ok: false, error: 'invalid_request', message: 'PKCE with S256 is required.' };
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) return { ok: false, error: 'invalid_request', message: 'Invalid code_challenge.' };
  const granted = clampScopes(input.scope, client.scopes);
  if (granted.length === 0) return { ok: false, error: 'invalid_scope', message: 'No valid scopes were requested.' };

  const code = newAuthorizationCode();
  await prisma.oAuthAuthorization.create({
    data: {
      clientId: client.id,
      userId,
      redirectUri: input.redirectUri,
      scope: granted,
      codeHash: hashCredential(code),
      codeChallenge: input.codeChallenge,
      challengeMethod: 'S256',
      expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
    },
  });
  return { ok: true, code, granted, applicationName: client.application.name };
}

type TokenRequest = {
  grantType: string;
  code: string | null;
  redirectUri: string | null;
  clientId: string;
  clientSecret: string | null;
  codeVerifier: string | null;
  refreshToken: string | null;
};

export type TokenGrantResult =
  | { kind: 'ISSUED'; accessToken: string; refreshToken: string | null; expiresIn: number; scope: string; tokenType: 'Bearer' }
  | { kind: 'ERROR'; status: number; body: Record<string, string> };

/** Exchanges an authorization code (with PKCE + optional client auth) or refresh token. */
export async function processTokenRequest(request: TokenRequest): Promise<TokenGrantResult> {
  if (request.grantType !== 'authorization_code' && request.grantType !== 'refresh_token') {
    return { kind: 'ERROR', status: 400, body: OAuthErrors.unsupportedGrantType() };
  }
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: request.clientId }, select: { id: true, secretHash: true, clientType: true, status: true, redirectUris: true, scopes: true } });
  if (!client || client.status !== 'ACTIVE') return { kind: 'ERROR', status: 401, body: OAuthErrors.invalidClient('Unknown or disabled client.') };

  // Confidential clients must authenticate (Basic header or body secret).
  if (client.clientType === 'CONFIDENTIAL') {
    if (!request.clientSecret) return { kind: 'ERROR', status: 401, body: OAuthErrors.invalidClient('client_secret is required for confidential clients.') };
    if (client.secretHash !== hashCredential(request.clientSecret)) return { kind: 'ERROR', status: 401, body: OAuthErrors.invalidClient() };
  } else if (request.clientSecret && client.secretHash && client.secretHash !== hashCredential(request.clientSecret)) {
    return { kind: 'ERROR', status: 401, body: OAuthErrors.invalidClient() };
  }

  if (request.grantType === 'authorization_code') {
    if (!request.code || !request.redirectUri || !request.codeVerifier) {
      return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidRequest('code, redirect_uri and code_verifier are required.') };
    }
    const authorization = await prisma.oAuthAuthorization.findUnique({ where: { codeHash: hashCredential(request.code) } });
    if (!authorization) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('Unknown authorization code.') };
    if (authorization.clientId !== client.id) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('Code was issued to a different client.') };
    if (authorization.redirectUri !== request.redirectUri) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('redirect_uri mismatch.') };
    if (authorization.expiresAt <= new Date()) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('Authorization code expired.') };

    // Replay protection + single-use: consume atomically inside a transaction.
    // If a code is replayed after being consumed, revoke all tokens previously
    // derived from it (RFC 6749 security BCP).
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.oAuthAuthorization.updateMany({ where: { id: authorization.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (claimed.count === 0) {
        // Replay detected — revoke tokens minted for this client+user.
        await tx.oAuthTokenRecord.updateMany({ where: { clientId: client.id, userId: authorization.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        return null;
      }
      if (pkceChallenge(request.codeVerifier!) !== authorization.codeChallenge) return 'PKCE';
      const access = newAccessToken();
      const refresh = newRefreshToken();
      const now = Date.now();
      const record = await tx.oAuthTokenRecord.create({
        data: {
          clientId: client.id,
          userId: authorization.userId,
          workspaceId: null,
          accessTokenHash: hashCredential(access),
          refreshTokenHash: hashCredential(refresh),
          scope: authorization.scope,
          expiresAt: new Date(now + OAUTH_ACCESS_TOKEN_TTL_MS),
          refreshExpiresAt: new Date(now + OAUTH_REFRESH_TOKEN_TTL_MS),
        },
      });
      return { access, refresh, scope: authorization.scope, workspaceId: record.workspaceId };
    });
    if (result === null) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('Authorization code was already used.') };
    if (result === 'PKCE') return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('PKCE verification failed.') };
    return { kind: 'ISSUED', accessToken: result.access, refreshToken: result.refresh, expiresIn: OAUTH_ACCESS_TOKEN_TTL_MS / 1000, scope: result.scope.join(' '), tokenType: 'Bearer' };
  }

  // refresh_token grant with rotation: the presented refresh token is revoked
  // and a new pair is issued in the same transaction.
  if (!request.refreshToken) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidRequest('refresh_token is required.') };
  const previous = await prisma.oAuthTokenRecord.findUnique({ where: { refreshTokenHash: hashCredential(request.refreshToken) } });
  if (!previous || previous.clientId !== client.id) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('Unknown refresh token.') };
  if (previous.revokedAt || !previous.refreshExpiresAt || previous.refreshExpiresAt <= new Date()) {
    return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('Refresh token expired or revoked.') };
  }
  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.oAuthTokenRecord.updateMany({ where: { id: previous.id, refreshTokenHash: hashCredential(request.refreshToken!), revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count === 0) return null;
    const access = newAccessToken();
    const refresh = newRefreshToken();
    const now = Date.now();
    await tx.oAuthTokenRecord.create({
      data: {
        clientId: client.id,
        userId: previous.userId,
        workspaceId: previous.workspaceId,
        accessTokenHash: hashCredential(access),
        refreshTokenHash: hashCredential(refresh),
        scope: previous.scope,
        expiresAt: new Date(now + OAUTH_ACCESS_TOKEN_TTL_MS),
        refreshExpiresAt: new Date(now + OAUTH_REFRESH_TOKEN_TTL_MS),
      },
    });
    return { access, refresh, scope: previous.scope };
  });
  if (!rotated) return { kind: 'ERROR', status: 400, body: OAuthErrors.invalidGrant('Refresh token was already rotated or revoked.') };
  return { kind: 'ISSUED', accessToken: rotated.access, refreshToken: rotated.refresh, expiresIn: OAUTH_ACCESS_TOKEN_TTL_MS / 1000, scope: rotated.scope.join(' '), tokenType: 'Bearer' };
}

/** Revokes a token (per RFC 7009); tolerant of unknown tokens. */
export async function revokeToken(token: string, clientId: string | null) {
  const hash = hashCredential(token);
  const record = await prisma.oAuthTokenRecord.findUnique({ where: { accessTokenHash: hash } });
  if (record && (!clientId || record.clientId === clientId)) {
    await prisma.oAuthTokenRecord.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return true;
  }
  const refresh = await prisma.oAuthTokenRecord.findUnique({ where: { refreshTokenHash: hash } });
  if (refresh && (!clientId || refresh.clientId === clientId)) {
    await prisma.oAuthTokenRecord.update({ where: { id: refresh.id }, data: { revokedAt: new Date() } });
    return true;
  }
  return false;
}
