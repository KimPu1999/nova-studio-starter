import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovaApiClient, NovaApiError } from '../src/lib/developer-sdk';

type Call = { url: string; init: RequestInit };

function mockFetch(handler: (call: Call, attempt: number) => Response | Promise<Response>) {
  let attempt = 0;
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call, attempt++);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

afterEach(() => vi.restoreAllMocks());

describe('NovaApiClient', () => {
  it('requires a credential', () => {
    expect(() => new NovaApiClient({ baseUrl: 'https://api.nova.test' })).toThrow(/apiKey or accessToken/);
  });

  it('unwraps the data envelope and exposes the requestId', async () => {
    const { impl, calls } = mockFetch(() => jsonResponse(200, { data: { email: 'a@b.c' }, requestId: 'req-42' }));
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test/', apiKey: 'nova_sk_test', fetchImpl: impl });
    await expect(client.me()).resolves.toEqual({ email: 'a@b.c' });
    expect(calls[0].url).toBe('https://api.nova.test/api/v1/me');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('authorization')).toBe('Bearer nova_sk_test');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('throws NovaApiError with code + requestId from the error envelope', async () => {
    const { impl } = mockFetch(() => jsonResponse(403, { error: { code: 'INSUFFICIENT_SCOPE', message: 'Nope.', requestId: 'req-7' } }));
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test', apiKey: 'nova_sk_test', fetchImpl: impl });
    const error = await client.me().catch((e) => e);
    expect(error).toBeInstanceOf(NovaApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('INSUFFICIENT_SCOPE');
    expect(error.requestId).toBe('req-7');
    expect(error.message).toBe('Nope.');
  });

  it('retries GET requests on 5xx and succeeds', async () => {
    const { impl, calls } = mockFetch((_, attempt) => attempt === 0 ? jsonResponse(503, { error: { code: 'SERVER_ERROR' } }) : jsonResponse(200, { data: { ok: true }, requestId: 'r' }));
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test', apiKey: 'nova_sk_test', fetchImpl: impl, maxRetries: 2 });
    await expect(client.projects()).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('retries GET on 429 honoring Retry-After (kept tiny in test)', async () => {
    const { impl, calls } = mockFetch((_, attempt) => attempt === 0 ? jsonResponse(429, { error: { code: 'RATE_LIMITED' } }, { 'retry-after': '0' }) : jsonResponse(200, { data: { items: [] }, requestId: 'r' }));
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test', apiKey: 'nova_sk_test', fetchImpl: impl, maxRetries: 1 });
    await expect(client.projects()).resolves.toEqual({ items: [] });
    expect(calls).toHaveLength(2);
  });

  it('never auto-retries mutations', async () => {
    const { impl, calls } = mockFetch(() => jsonResponse(503, { error: { code: 'SERVER_ERROR', message: 'Down.' } }));
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test', apiKey: 'nova_sk_test', fetchImpl: impl, maxRetries: 2 });
    await expect(client.createDeployment('d0a2d3a0-9d3f-4c4b-8a6d-3f2b9a1c7e55', 'idem-key-1')).rejects.toBeInstanceOf(NovaApiError);
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('idempotency-key')).toBe('idem-key-1');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('gives up after exhausting GET retries', async () => {
    const { impl, calls } = mockFetch(() => jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'Down.' } }));
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test', apiKey: 'nova_sk_test', fetchImpl: impl, maxRetries: 1 });
    await expect(client.me()).rejects.toBeInstanceOf(NovaApiError);
    expect(calls).toHaveLength(2);
  });

  it('paginate walks every page via nextCursor', async () => {
    const { impl, calls } = mockFetch((call) => {
      if (call.url.endsWith('/api/v1/projects')) return jsonResponse(200, { data: { items: ['a', 'b'], nextCursor: 'c-1' }, requestId: 'r1' });
      return jsonResponse(200, { data: { items: ['c'], nextCursor: null }, requestId: 'r2' });
    });
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test', apiKey: 'nova_sk_test', fetchImpl: impl });
    const seen: string[] = [];
    for await (const item of client.paginate<string>('/api/v1/projects')) seen.push(item);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://api.nova.test/api/v1/projects?cursor=c-1');
  });

  it('stops paginating immediately on an empty page', async () => {
    const { impl, calls } = mockFetch(() => jsonResponse(200, { data: { items: [], nextCursor: null }, requestId: 'r' }));
    const client = new NovaApiClient({ baseUrl: 'https://api.nova.test', apiKey: 'nova_sk_test', fetchImpl: impl });
    const seen: string[] = [];
    for await (const item of client.paginate<string>('/api/v1/projects')) seen.push(item);
    expect(seen).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
