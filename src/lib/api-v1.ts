import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { hashCredential } from './security/secrets';
import { rateLimitCheck, monthlyQuotaCheck } from './api/rate-limit';
import { acquireConcurrencySlot, releaseConcurrencySlot } from './api/concurrency';

export const apiScopes = [
  'profile:read',
  'workspaces:read',
  'projects:read',
  'projects:write',
  'websites:read',
  'deployments:read',
  'deployments:write',
  'marketplace:read',
  'ai_usage:read',
  'webhooks:read',
  'webhooks:write',
] as const;

export type ApiScope = (typeof apiScopes)[number];

export const sandboxScopes: ApiScope[] = [
  'profile:read',
  'workspaces:read',
  'projects:read',
  'projects:write',
  'websites:read',
  'deployments:read',
  'deployments:write',
  'webhooks:read',
  'webhooks:write',
];

export type ApiCredentialKind = 'API_KEY' | 'SERVICE_ACCOUNT' | 'OAUTH_TOKEN' | 'SANDBOX_KEY';
export type ApiEnvironment = 'PRODUCTION' | 'SANDBOX';

export type ApiPrincipal = {
  userId: string;
  credentialId: string;
  workspaceId: string | null;
  scopes: string[];
  requestId: string;
  kind: ApiCredentialKind;
  environment: ApiEnvironment;
};

export type ApiAuthFailure = { code: string; message: string; status: number };

export function requestId(request: Request) {
  return request.headers.get('x-request-id')?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100) || crypto.randomUUID();
}

const ERROR_STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIAL: 401,
  EXPIRED_CREDENTIAL: 401,
  CREDENTIAL_REVOKED: 401,
  INSUFFICIENT_SCOPE: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RESOURCE_LOCKED: 409,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  CONCURRENCY_LIMITED: 429,
  SANDBOX_ONLY: 400,
};

export function apiError(code: string, message: string, status: number, id: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ error: { code, message, requestId: id } }, { status, headers: { 'x-request-id': id, ...extraHeaders } });
}

export function apiOk<T>(data: T, id: string, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ data, requestId: id }, { status, headers: { 'x-request-id': id, ...extraHeaders } });
}

/** Rate limit window settings. Adjust per environment via env when needed. */
export const apiLimits = {
  perCredentialPerMinute: Number(process.env.API_RATE_PER_CREDENTIAL_PER_MINUTE || 60),
  perUserPerMinute: Number(process.env.API_RATE_PER_USER_PER_MINUTE || 240),
  monthlyQuotaDefault: Number(process.env.API_MONTHLY_QUOTA_DEFAULT || 50_000),
  sandboxMonthlyQuota: Number(process.env.API_SANDBOX_MONTHLY_QUOTA || 2_000),
  maxConcurrentPerCredential: Number(process.env.API_MAX_CONCURRENCY || 10),
};

const DEFAULT_LIMITS = apiLimits.perCredentialPerMinute;

export async function authenticateApiRequest(
  request: Request,
  requiredScope: ApiScope,
  options: { allowSandbox?: boolean } = {},
): Promise<{ principal?: ApiPrincipal; response?: NextResponse }> {
  const id = requestId(request);
  const path = new URL(request.url).pathname;
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return { response: apiError('AUTH_REQUIRED', 'A scoped API credential is required.', 401, id) };
  const raw = header.slice(7).trim();
  if (!raw || raw.length > 400) return { response: apiError('INVALID_CREDENTIAL', 'The API credential is invalid.', 401, id) };

  const keyHash = hashCredential(raw);

  // 1. Personal / workspace API keys (Phase 16).
  const apiKey = await prisma.apiCredential.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, workspaceId: true, scopes: true, expiresAt: true, revokedAt: true },
  });
  if (apiKey) {
    if (apiKey.revokedAt) return { response: apiError('CREDENTIAL_REVOKED', 'This credential has been revoked.', 401, id) };
    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) return { response: apiError('EXPIRED_CREDENTIAL', 'This credential has expired.', 401, id) };
    if (!apiKey.scopes.includes(requiredScope)) return { response: apiError('INSUFFICIENT_SCOPE', `The ${requiredScope} scope is required.`, 403, id) };
    const principal: ApiPrincipal = { userId: apiKey.userId, credentialId: apiKey.id, workspaceId: apiKey.workspaceId, scopes: apiKey.scopes, requestId: id, kind: 'API_KEY', environment: 'PRODUCTION' };
    return finishAuth(request, principal, options);
  }

  // 2. Workspace service accounts (Phase 16).
  const serviceAccount = await prisma.serviceAccount.findUnique({
    where: { secretHash: keyHash },
    select: { id: true, workspaceId: true, scopes: true, expiresAt: true, revokedAt: true },
  });
  if (serviceAccount) {
    if (serviceAccount.revokedAt) return { response: apiError('CREDENTIAL_REVOKED', 'This credential has been revoked.', 401, id) };
    if (serviceAccount.expiresAt && serviceAccount.expiresAt <= new Date()) return { response: apiError('EXPIRED_CREDENTIAL', 'This credential has expired.', 401, id) };
    if (!serviceAccount.scopes.includes(requiredScope)) return { response: apiError('INSUFFICIENT_SCOPE', `The ${requiredScope} scope is required.`, 403, id) };
    const principal: ApiPrincipal = { userId: '', credentialId: serviceAccount.id, workspaceId: serviceAccount.workspaceId, scopes: serviceAccount.scopes, requestId: id, kind: 'SERVICE_ACCOUNT', environment: 'PRODUCTION' };
    return finishAuth(request, principal, options);
  }

  // 3. OAuth 2.0 bearer tokens (Phase 17).
  const token = await prisma.oAuthTokenRecord.findUnique({
    where: { accessTokenHash: keyHash },
    select: { id: true, userId: true, workspaceId: true, scope: true, expiresAt: true, revokedAt: true },
  });
  if (token) {
    if (token.revokedAt) return { response: apiError('CREDENTIAL_REVOKED', 'This token has been revoked.', 401, id) };
    if (token.expiresAt <= new Date()) return { response: apiError('EXPIRED_CREDENTIAL', 'This token has expired.', 401, id) };
    if (!token.scope.includes(requiredScope)) return { response: apiError('INSUFFICIENT_SCOPE', `The ${requiredScope} scope is required.`, 403, id) };
    const principal: ApiPrincipal = { userId: token.userId, credentialId: token.id, workspaceId: token.workspaceId, scopes: token.scope, requestId: id, kind: 'OAUTH_TOKEN', environment: 'PRODUCTION' };
    return finishAuth(request, principal, options);
  }

  // 4. Sandbox keys (Phase 17) — isolated environment, sandbox endpoints only.
  const sandbox = await prisma.developerSandbox.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, workspaceId: true, status: true, quota: true, used: true },
  });
  if (sandbox) {
    if (!path.startsWith('/api/v1/sandbox')) return { response: apiError('SANDBOX_ONLY', 'Sandbox keys can only call /api/v1/sandbox endpoints.', 400, id) };
    if (sandbox.status !== 'ACTIVE') return { response: apiError('CREDENTIAL_REVOKED', 'This sandbox has been disabled.', 401, id) };
    if (options.allowSandbox === false) return { response: apiError('SANDBOX_ONLY', 'This endpoint does not accept sandbox credentials.', 400, id) };
    const principal: ApiPrincipal = { userId: sandbox.userId, credentialId: sandbox.id, workspaceId: sandbox.workspaceId, scopes: [...sandboxScopes], requestId: id, kind: 'SANDBOX_KEY', environment: 'SANDBOX' };
    return finishAuth(request, principal, options);
  }

  return { response: apiError('INVALID_CREDENTIAL', 'The API credential is invalid or expired.', 401, id) };
}

/** Shared post-authentication pipeline: abuse limits, quotas, concurrency. */
async function finishAuth(request: Request, principal: ApiPrincipal, options: { allowSandbox?: boolean }): Promise<{ principal?: ApiPrincipal; response?: NextResponse }> {
  const id = principal.requestId;

  // Sandbox quota is tracked on the sandbox record itself.
  if (principal.kind === 'SANDBOX_KEY') {
    const sandbox = await prisma.developerSandbox.findUnique({ where: { id: principal.credentialId }, select: { used: true, quota: true } });
    if (sandbox && sandbox.used >= sandbox.quota) {
      return { response: apiError('QUOTA_EXCEEDED', 'Sandbox monthly quota exhausted.', 429, id) };
    }
    return { principal };
  }

  // Per-credential fixed window (atomic counter; safe across instances).
  const perMinute = await rateLimitCheck(`credential:${principal.credentialId}`, DEFAULT_LIMITS, 60_000);
  if (!perMinute.allowed) {
    return { response: apiError('RATE_LIMITED', 'Rate limit exceeded for this credential.', 429, id, { 'retry-after': String(perMinute.retryAfterSeconds) }) };
  }

  // Per-user fixed window (defense in depth across many credentials).
  if (principal.userId) {
    const perUser = await rateLimitCheck(`user:${principal.userId}`, apiLimits.perUserPerMinute, 60_000);
    if (!perUser.allowed) {
      return { response: apiError('RATE_LIMITED', 'Rate limit exceeded for this user.', 429, id, { 'retry-after': String(perUser.retryAfterSeconds) }) };
    }
  }

  // Monthly workspace quota (shared by every credential of the workspace).
  // Phase 18: prefer the verified subscription's API entitlement, then the
  // workspace ApiQuotaPolicy, then the platform default.
  const quotaKey = principal.workspaceId ? `workspace:${principal.workspaceId}` : principal.userId ? `user:${principal.userId}` : null;
  if (quotaKey) {
    let monthlyLimit = apiLimits.monthlyQuotaDefault;
    if (principal.workspaceId) {
      const [policy, account] = await Promise.all([
        prisma.apiQuotaPolicy.findUnique({ where: { workspaceId: principal.workspaceId } }),
        prisma.billingAccount.findUnique({ where: { billingKey: `ORG:${(await prisma.workspace.findUnique({ where: { id: principal.workspaceId }, select: { organizationId: true } }))?.organizationId}` } }),
      ]);
      if (account) {
        const entitlement = await prisma.billingEntitlement.findFirst({ where: { accountId: account.id, enabled: true, featureKey: 'api.requests.monthly' } });
        if (entitlement?.valueInt != null) monthlyLimit = entitlement.valueInt;
      }
      if (monthlyLimit === apiLimits.monthlyQuotaDefault && policy?.monthlyRequests) monthlyLimit = policy.monthlyRequests;
    }
    const quota = await monthlyQuotaCheck(quotaKey, monthlyLimit);
    if (!quota.allowed) {
      return { response: apiError('QUOTA_EXCEEDED', 'Monthly API quota exhausted for this workspace.', 429, id, { 'retry-after': String(quota.retryAfterSeconds) }) };
    }
  }

  // Best-effort per-instance concurrency cap.
  const concurrency = acquireConcurrencySlot(principal.credentialId, apiLimits.maxConcurrentPerCredential);
  if (!concurrency.allowed) {
    return { response: apiError('CONCURRENCY_LIMITED', 'Too many concurrent requests for this credential.', 429, id) };
  }

  return { principal };
}

export function releaseAuthSlot(principal: ApiPrincipal) {
  if (principal.kind !== 'SANDBOX_KEY') releaseConcurrencySlot(principal.credentialId);
}

export async function recordApiUsage(principal: ApiPrincipal, request: Request, statusCode: number, startedAt: number) {
  const data = {
    userId: principal.userId || null,
    workspaceId: principal.workspaceId,
    credentialId: principal.credentialId,
    requestId: principal.requestId,
    method: request.method,
    endpoint: new URL(request.url).pathname,
    statusCode,
    latencyMs: Math.max(0, Date.now() - startedAt),
    rateLimited: statusCode === 429,
  };
  await prisma.apiUsageEvent.create({ data }).catch(() => undefined);
  if (principal.kind === 'API_KEY') {
    await prisma.apiCredential.update({ where: { id: principal.credentialId }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  if (principal.kind === 'OAUTH_TOKEN') {
    await prisma.oAuthTokenRecord.update({ where: { id: principal.credentialId }, data: {} }).catch(() => undefined);
  }
  if (principal.kind === 'SANDBOX_KEY') {
    await prisma.developerSandbox.update({ where: { id: principal.credentialId }, data: { used: { increment: 1 } } }).catch(() => undefined);
  }
}

export function pagination(request: Request, defaultLimit = 20, maxLimit = 50) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') || defaultLimit);
  const limit = Number.isFinite(requestedLimit) ? Math.min(maxLimit, Math.max(1, Math.floor(requestedLimit))) : defaultLimit;
  const candidate = url.searchParams.get('cursor');
  const cursor = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : undefined;
  return { limit, cursor };
}

export function payloadHash(payload: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function requireWorkspaceMembershipRole(principal: ApiPrincipal, allowed: string[]) {
  // Service accounts are bound to exactly one workspace; keys/OAuth tokens are
  // checked against the user's membership by the caller.
  if (principal.kind === 'SERVICE_ACCOUNT') return principal.workspaceId;
  return null;
}
