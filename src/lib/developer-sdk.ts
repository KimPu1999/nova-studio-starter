export type ApiClientOptions = { baseUrl: string; apiKey?: string; accessToken?: string; timeoutMs?: number };
export type ApiError = { error?: { code?: string; message?: string; requestId?: string } };

export class NovaApiClient {
  private readonly options: ApiClientOptions;
  constructor(options: ApiClientOptions) { if (!options.apiKey && !options.accessToken) throw new Error('Provide apiKey or accessToken.'); this.options = { timeoutMs: 10_000, ...options, baseUrl: options.baseUrl.replace(/\/$/, '') }; }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.options.timeoutMs); try { const headers = new Headers(init.headers); headers.set('accept', 'application/json'); headers.set('authorization', `Bearer ${this.options.accessToken || this.options.apiKey}`); const response = await fetch(`${this.options.baseUrl}${path}`, { ...init, headers, signal: controller.signal }); const body = await response.json() as T & ApiError; if (!response.ok) throw new Error(body.error?.message || `API request failed (${response.status}).`); return body as T; } finally { clearTimeout(timer); } }
  me() { return this.request('/api/v1/me'); }
  workspaces() { return this.request('/api/v1/workspaces'); }
  projects() { return this.request('/api/v1/projects'); }
  websites() { return this.request('/api/v1/websites'); }
  marketplaceProducts() { return this.request('/api/v1/marketplace/products'); }
  aiUsage() { return this.request('/api/v1/ai/usage'); }
}
