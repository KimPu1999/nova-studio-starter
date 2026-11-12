import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { hashCredential } from './security/secrets';

export const apiScopes = ['profile:read', 'workspaces:read', 'projects:read', 'projects:write', 'websites:read', 'deployments:read', 'deployments:write', 'marketplace:read', 'ai_usage:read', 'webhooks:read', 'webhooks:write'] as const;
export type ApiScope = typeof apiScopes[number];

export type ApiPrincipal = { userId: string; credentialId: string; workspaceId: string | null; scopes: string[]; requestId: string };

export function requestId(request: Request) { return request.headers.get('x-request-id')?.slice(0, 100) || crypto.randomUUID(); }

export function apiError(code: string, message: string, status: number, id: string) { return NextResponse.json({ error: { code, message, requestId: id } }, { status, headers: { 'x-request-id': id } }); }
export function apiOk<T>(data: T, id: string, status = 200) { return NextResponse.json({ data, requestId: id }, { status, headers: { 'x-request-id': id } }); }

export async function authenticateApiRequest(request: Request, requiredScope: ApiScope): Promise<{ principal?: ApiPrincipal; response?: NextResponse }> {
  const id = requestId(request);
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return { response: apiError('AUTH_REQUIRED', 'A scoped API credential is required.', 401, id) };
  const raw = header.slice(7).trim();
  if (!raw || raw.length > 300) return { response: apiError('INVALID_CREDENTIAL', 'The API credential is invalid.', 401, id) };
  const credential = await prisma.apiCredential.findUnique({ where: { keyHash: hashCredential(raw) }, select: { id: true, userId: true, workspaceId: true, scopes: true, expiresAt: true, revokedAt: true } });
  if (!credential || credential.revokedAt || (credential.expiresAt && credential.expiresAt <= new Date())) return { response: apiError('INVALID_CREDENTIAL', 'The API credential is invalid or expired.', 401, id) };
  if (!credential.scopes.includes(requiredScope)) return { response: apiError('INSUFFICIENT_SCOPE', `The ${requiredScope} scope is required.`, 403, id) };
  const recent = await prisma.apiUsageEvent.count({ where: { credentialId: credential.id, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recent >= 60) return { response: NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded.', requestId: id } }, { status: 429, headers: { 'x-request-id': id, 'retry-after': '60' } }) };
  return { principal: { userId: credential.userId, credentialId: credential.id, workspaceId: credential.workspaceId, scopes: credential.scopes, requestId: id } };
}

export async function recordApiUsage(principal: ApiPrincipal, request: Request, statusCode: number, startedAt: number) {
  await prisma.apiUsageEvent.create({ data: { userId: principal.userId, workspaceId: principal.workspaceId, credentialId: principal.credentialId, requestId: principal.requestId, method: request.method, endpoint: new URL(request.url).pathname, statusCode, latencyMs: Math.max(0, Date.now() - startedAt), rateLimited: statusCode === 429 } }).catch(() => undefined);
  await prisma.apiCredential.update({ where: { id: principal.credentialId }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
}

export function pagination(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') || 20);
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 20;
  const candidate = url.searchParams.get('cursor');
  const cursor = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : undefined;
  return { limit, cursor };
}

export function payloadHash(payload: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
