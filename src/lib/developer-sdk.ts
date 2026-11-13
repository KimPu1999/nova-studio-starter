/**
 * NOVA API v1 TypeScript client.
 *
 * Design rules:
 * - Credentials are supplied by the caller and never logged.
 * - Only safe (GET) requests are retried automatically, with exponential
 *   backoff; mutations are never auto-retried (use Idempotency-Key instead).
 * - 429 responses honor `Retry-After` before giving up.
 * - Every request carries a timeout; the client always parses the NOVA
 *   envelope ({ data, requestId } / { error: { code, message, requestId } }).
 */

export type ApiClientOptions = {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
};

export type ApiEnvelope<T> = { data: T; requestId: string };
export type ApiErrorBody = { error?: { code?: string; message?: string; requestId?: string } };

export const ApiErrorCode = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_CREDENTIAL: 'INVALID_CREDENTIAL',
  EXPIRED_CREDENTIAL: 'EXPIRED_CREDENTIAL',
  CREDENTIAL_REVOKED: 'CREDENTIAL_REVOKED',
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_REQUEST: 'INVALID_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  CONCURRENCY_LIMITED: 'CONCURRENCY_LIMITED',
  SANDBOX_ONLY: 'SANDBOX_ONLY',
} as const;

export class NovaApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'NovaApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export type NovaPage<T> = { items: T[]; nextCursor: string | null };

export class NovaApiClient {
  private readonly options: Required<Pick<ApiClientOptions, 'timeoutMs' | 'maxRetries'>> & ApiClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    if (!options.apiKey && !options.accessToken) throw new Error('Provide apiKey or accessToken.');
    this.options = {
      timeoutMs: 10_000,
      maxRetries: 2,
      ...options,
      baseUrl: options.baseUrl.replace(/\/$/, ''),
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private bearer() {
    return `Bearer ${this.options.accessToken || this.options.apiKey}`;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Performs a request and unwraps the NOVA envelope. GET requests are retried
   * with backoff on 5xx/429; other methods are issued exactly once.
   */
  async request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('accept', 'application/json');
      headers.set('authorization', this.bearer());
      if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
      const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiErrorBody;
      if (!response.ok) {
        const code = body.error?.code ?? `HTTP_${response.status}`;
        const error = new NovaApiError(response.status, code, body.error?.message || `API request failed (${response.status}).`, body.error?.requestId);
        const retryable = (init.method ?? 'GET') === 'GET' && (response.status === 429 || response.status >= 500) && attempt < this.options.maxRetries;
        if (retryable) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
          await this.sleep(Math.min(backoff, 15_000));
          return this.request<T>(path, init, attempt + 1);
        }
        throw error;
      }
      return body.data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET a paginated collection once. */
  async page<T>(path: string): Promise<{ page: NovaPage<T>; requestId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, { headers: { accept: 'application/json', authorization: this.bearer() }, signal: controller.signal });
      const body = (await response.json().catch(() => ({}))) as ApiEnvelope<NovaPage<T>> & ApiErrorBody;
      if (!response.ok) throw new NovaApiError(response.status, body.error?.code ?? `HTTP_${response.status}`, body.error?.message || `API request failed (${response.status}).`, body.error?.requestId);
      return { page: body.data, requestId: body.requestId };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Iterates every item across all pages (at-least-once; new pages may appear). */
  async *paginate<T>(path: string): AsyncGenerator<T, void, unknown> {
    let cursor: string | null = null;
    for (;;) {
      const url = new URL(path, 'https://internal.invalid');
      if (cursor) url.searchParams.set('cursor', cursor);
      const { page } = await this.page<T>(`${url.pathname}${url.search}`);
      for (const item of page.items) yield item;
      if (!page.nextCursor || page.items.length === 0) return;
      cursor = page.nextCursor;
    }
  }

  private search(path: string, params: Record<string, string | number | undefined>) {
    const url = new URL(path, 'https://internal.invalid');
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    return `${url.pathname}${url.search}`;
  }

  me() { return this.request<Record<string, unknown>>('/api/v1/me'); }
  workspaces() { return this.request<Array<Record<string, unknown>>>('/api/v1/workspaces'); }
  projects(params: { limit?: number; cursor?: string } = {}) { return this.request<NovaPage<Record<string, unknown>>>(this.search('/api/v1/projects', params)); }
  project(id: string) { return this.request<Record<string, unknown>>(`/api/v1/projects/${encodeURIComponent(id)}`); }
  updateProject(id: string, body: { name?: string; description?: string }) { return this.request<Record<string, unknown>>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); }
  websites() { return this.request<Array<Record<string, unknown>>>('/api/v1/websites'); }
  website(id: string) { return this.request<Record<string, unknown>>(`/api/v1/websites/${encodeURIComponent(id)}`); }
  deployments(params: { limit?: number; cursor?: string } = {}) { return this.request<NovaPage<Record<string, unknown>>>(this.search('/api/v1/deployments', params)); }
  deployment(id: string) { return this.request<Record<string, unknown>>(`/api/v1/deployments/${encodeURIComponent(id)}`); }
  /** Queue a deployment. The idempotency key makes retries safe. */
  createDeployment(websiteId: string, idempotencyKey: string) {
    return this.request<Record<string, unknown>>('/api/v1/deployments', { method: 'POST', body: JSON.stringify({ websiteId }), headers: { 'idempotency-key': idempotencyKey } });
  }
  marketplaceProducts(params: { limit?: number; cursor?: string } = {}) { return this.request<NovaPage<Record<string, unknown>>>(this.search('/api/v1/marketplace/products', params)); }
  aiUsage() { return this.request<Record<string, unknown>>('/api/v1/ai/usage'); }
  webhookEndpoints(params: { limit?: number; cursor?: string } = {}) { return this.request<NovaPage<Record<string, unknown>>>(this.search('/api/v1/webhooks', params)); }
  sandboxUsage() { return this.request<Record<string, unknown>>('/api/v1/sandbox/usage'); }
}
