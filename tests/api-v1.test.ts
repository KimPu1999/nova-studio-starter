import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  apiScopes,
  sandboxScopes,
  requestId,
  apiOk,
  apiError,
  pagination,
  payloadHash,
} from '../src/lib/api-v1';
import { acquireConcurrencySlot, releaseConcurrencySlot, activeCount, resetConcurrency } from '../src/lib/api/concurrency';
import { idempotencyKeyFrom } from '../src/lib/api/idempotency';

function req(path: string, init: RequestInit = {}) {
  return new NextRequest(`https://api.nova.test${path}`, init as never);
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('api v1 pagination', () => {
  it('clamps limit to the 1..max range and applies the default', () => {
    expect(pagination(req('/api/v1/projects')).limit).toBe(20);
    expect(pagination(req('/api/v1/projects?limit=0')).limit).toBe(1);
    expect(pagination(req('/api/v1/projects?limit=9999')).limit).toBe(50);
    expect(pagination(req('/api/v1/projects?limit=abc')).limit).toBe(20);
    expect(pagination(req('/api/v1/projects?limit=5'), 20, 10).limit).toBe(5);
  });

  it('only accepts well-formed UUID cursors', () => {
    expect(pagination(req('/api/v1/projects?cursor=not-a-uuid')).cursor).toBeUndefined();
    expect(pagination(req('/api/v1/projects?cursor=' + 'x'.repeat(36))).cursor).toBeUndefined();
    expect(pagination(req('/api/v1/projects?cursor=' + 'd0a2d3a0-9d3f-4c4b-8a6d-3f2b9a1c7e55')).cursor).toBe('d0a2d3a0-9d3f-4c4b-8a6d-3f2b9a1c7e55');
  });
});

describe('api v1 envelope + request ids', () => {
  it('sanitizes client-supplied request ids', () => {
    const tainted = req('/api/v1/me', { headers: { 'x-request-id': 'abc<script>__' } } as RequestInit);
    expect(requestId(tainted)).toBe('abcscript__');
    expect(requestId(req('/api/v1/me'))).toMatch(UUID_V4);
  });

  it('returns a consistent envelope with an x-request-id header', async () => {
    const ok = apiOk({ hello: 'world' }, 'req-1', 200, { 'x-custom': '1' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-request-id')).toBe('req-1');
    expect(ok.headers.get('x-custom')).toBe('1');
    await expect(ok.json()).resolves.toEqual({ data: { hello: 'world' }, requestId: 'req-1' });

    const err = apiError('FORBIDDEN', 'No.', 403, 'req-2');
    expect(err.status).toBe(403);
    await expect(err.json()).resolves.toEqual({ error: { code: 'FORBIDDEN', message: 'No.', requestId: 'req-2' } });
  });
});

describe('api v1 scopes', () => {
  it('sandbox scopes are a strict subset of the public scope list and exclude none-sandbox abilities', () => {
    const publicSet = new Set<string>(apiScopes);
    for (const scope of sandboxScopes) expect(publicSet.has(scope)).toBe(true);
    // Sandbox keys get no marketplace or ai-usage scopes.
    expect(sandboxScopes).not.toContain('marketplace:read');
    expect(sandboxScopes).not.toContain('ai_usage:read');
  });

  it('never grants platform-admin abilities via scopes', () => {
    for (const scope of apiScopes) {
      expect(scope.startsWith('admin:')).toBe(false);
      expect(scope.startsWith('platform:')).toBe(false);
      expect(scope.includes('payment')).toBe(false);
      expect(scope.includes('payout')).toBe(false);
    }
  });
});

describe('api v1 helpers', () => {
  it('hashes payloads deterministically and sensitively', () => {
    expect(payloadHash({ a: 1 })).toBe(payloadHash({ a: 1 }));
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
  });

  it('validates idempotency key shape', () => {
    const withHeader = (key: string) => new NextRequest('https://api.nova.test/api/v1/deployments', { headers: { 'idempotency-key': key } });
    expect(idempotencyKeyFrom(withHeader('deploy-2026-11-13.1'))).toBe('deploy-2026-11-13.1');
    expect(idempotencyKeyFrom(withHeader('short'))).toBeNull();
    expect(idempotencyKeyFrom(withHeader('bad key!'))).toBeNull();
    expect(idempotencyKeyFrom(req('/api/v1/deployments'))).toBeNull();
  });
});

describe('per-instance concurrency cap', () => {
  it('blocks beyond the limit and releases cleanly', () => {
    resetConcurrency();
    for (let i = 0; i < 3; i++) expect(acquireConcurrencySlot('cred-1', 3).allowed).toBe(true);
    expect(acquireConcurrencySlot('cred-1', 3).allowed).toBe(false);
    expect(activeCount('cred-1')).toBe(3);
    releaseConcurrencySlot('cred-1');
    expect(activeCount('cred-1')).toBe(2);
    releaseConcurrencySlot('cred-1');
    releaseConcurrencySlot('cred-1');
    expect(activeCount('cred-1')).toBe(0);
    expect(acquireConcurrencySlot('cred-1', 3).allowed).toBe(true);
    resetConcurrency();
  });
});
