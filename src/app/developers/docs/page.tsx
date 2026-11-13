import Link from 'next/link';

export const dynamic = 'force-static';

const sections = [
  { id: 'authentication', title: 'Authentication', body: 'Every v1 request sends Authorization: Bearer <token>. Four credential kinds are accepted: personal API keys (nova_sk_…), workspace service-account secrets, OAuth 2.0 bearer tokens (nova_at_…) and sandbox keys (nova_sb_…). Sandbox keys may only call /api/v1/sandbox/* endpoints and receive SANDBOX_ONLY otherwise.' },
  { id: 'scopes', title: 'Scopes', body: 'Scopes are enforced server-side on every route. The fixed set: profile:read, workspaces:read, projects:read/write, websites:read, deployments:read/write, marketplace:read, ai_usage:read, webhooks:read/write. OAuth scopes are clamped to this list — no platform-admin ability can be granted through the public API.' },
  { id: 'errors', title: 'Error format', body: 'Errors return { "error": { "code", "message", "requestId" } }. Codes: AUTH_REQUIRED (401), INVALID_CREDENTIAL (401), EXPIRED_CREDENTIAL (401), CREDENTIAL_REVOKED (401), INSUFFICIENT_SCOPE (403), FORBIDDEN (403), NOT_FOUND (404), INVALID_REQUEST (400), VALIDATION_ERROR (400), CONFLICT (409), IDEMPOTENCY_CONFLICT (409), RESOURCE_LOCKED (409), RATE_LIMITED (429), QUOTA_EXCEEDED (429), CONCURRENCY_LIMITED (429), SANDBOX_ONLY (400). Every response carries an x-request-id header.' },
  { id: 'rate-limits', title: 'Rate limits & quotas', body: 'Fixed windows enforced atomically in Postgres: 60 requests/minute per credential and 240/minute per user. A monthly workspace quota (default 50,000; sandbox 2,000) counts all credentials combined, so rotating keys cannot bypass it. Exceeding either returns 429 with a Retry-After header. A per-instance concurrency cap (default 10 per credential) applies to mutating requests; in multi-instance deployments the effective cap scales by instance count.' },
  { id: 'pagination', title: 'Pagination', body: 'Cursor-based: ?limit=1..50 and ?cursor=<last item id>. Responses wrap as { "items": [...], "nextCursor": "…" | null }. cursors are opaque UUIDs; invalid or foreign cursors are ignored.' },
  { id: 'idempotency', title: 'Idempotency', body: 'POST /api/v1/deployments requires an Idempotency-Key header (8-255 chars, [A-Za-z0-9._-]). The key is scoped to your credential + operation and bound to the request payload: identical retries replay the stored response, a different payload with the same key returns 409 IDEMPOTENCY_CONFLICT, and an in-flight duplicate returns 409 RESOURCE_LOCKED. Keys are retained 24 hours.' },
  { id: 'webhooks', title: 'Webhooks', body: 'Deliveries are written to a transactional outbox and dispatched with at-least-once semantics. Verify signatures: nova-signature = HMAC-SHA256(secret, "{timestamp}.{eventId}.{rawBody}"), presented in the nova-signature, nova-timestamp, nova-event-id and nova-event-type headers. Reject anything older/newer than 5 minutes. Failed attempts retry at 1m, 5m, 30m, 2h, 8h, 24h, then dead-letter. Endpoints must be HTTPS on port 443 or 8443 and are protected against SSRF (private ranges, metadata hosts and redirects are blocked).' },
  { id: 'oauth', title: 'OAuth 2.0', body: 'Authorization code flow with mandatory PKCE S256 at /oauth/authorize. Tokens exchange at POST /api/v1/oauth/token (authorization_code and refresh_token grants, refresh rotation, single-use codes whose replay revokes derived tokens). Confidential clients authenticate via HTTP Basic. Revoke with RFC 7009 semantics at POST /api/v1/oauth/revoke. Access tokens last 1 hour, refresh tokens 30 days.' },
  { id: 'sandbox', title: 'Sandbox', body: 'Sandboxes are isolated environments with their own nova_sb_ key, quota and event simulation endpoint (POST /api/v1/sandbox/events). Simulated events are labelled environment: SANDBOX and only deliver to that workspace\'s webhook endpoints. Nothing in sandbox touches production records.' },
  { id: 'versioning', title: 'Versioning', body: 'REST v1 is additive-only within the /api/v1 prefix. Webhook payloads carry a version (currently 2026-11-13); a breaking event change ships as a new version you opt into per subscription.' },
];

export default function DeveloperDocsPage() {
  return (
    <main className="admin-content max-w-4xl">
      <p className="eyebrow">API V1 REFERENCE</p>
      <h1 className="admin-title">Documentation.</h1>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/developers/quickstart" className="btn-primary">Quickstart</Link>
        <Link href="/developers/changelog" className="btn-outline">Changelog</Link>
      </div>
      <div className="mt-8 space-y-6">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="admin-panel">
            <h2 className="font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{section.body}</p>
          </section>
        ))}
      </div>
      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Endpoints</h2>
        <table className="admin-table mt-4">
          <thead><tr><th>Method</th><th>Path</th><th>Scope</th></tr></thead>
          <tbody>
            {[
              ['GET', '/api/v1/me', 'profile:read'],
              ['GET', '/api/v1/workspaces', 'workspaces:read'],
              ['GET', '/api/v1/projects', 'projects:read'],
              ['POST', '/api/v1/projects', 'projects:write'],
              ['GET', '/api/v1/projects/{id}', 'projects:read'],
              ['PATCH', '/api/v1/projects/{id}', 'projects:write'],
              ['GET', '/api/v1/websites', 'websites:read'],
              ['GET', '/api/v1/websites/{id}', 'websites:read'],
              ['GET', '/api/v1/deployments', 'deployments:read'],
              ['POST', '/api/v1/deployments (Idempotency-Key)', 'deployments:write'],
              ['GET', '/api/v1/deployments/{id}', 'deployments:read'],
              ['GET', '/api/v1/marketplace/products', 'marketplace:read'],
              ['GET', '/api/v1/ai/usage', 'ai_usage:read'],
              ['GET', '/api/v1/webhooks', 'webhooks:read'],
              ['POST', '/api/v1/webhooks', 'webhooks:write'],
              ['PATCH', '/api/v1/webhooks/{id}', 'webhooks:write'],
              ['POST', '/api/v1/webhooks/{id} (rotate secret)', 'webhooks:write'],
              ['DELETE', '/api/v1/webhooks/{id}', 'webhooks:write'],
              ['GET', '/api/v1/sandbox/events', 'sandbox keys only'],
              ['POST', '/api/v1/sandbox/events', 'sandbox keys only'],
              ['GET', '/api/v1/sandbox/usage', 'sandbox keys only'],
              ['POST', '/api/v1/oauth/token', 'OAuth (no bearer)'],
              ['POST', '/api/v1/oauth/revoke', 'OAuth (RFC 7009)'],
            ].map(([method, path, scope]) => (
              <tr key={`${method}-${path}`}><td className="font-mono text-xs text-cyan-200">{method}</td><td className="font-mono text-xs">{path}</td><td className="text-xs text-slate-500">{scope}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="admin-panel mt-6">
        <h2 className="font-semibold">TypeScript SDK</h2>
        <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#09090F] p-5 text-xs text-cyan-100"><code>{`import { NovaApiClient } from '@/lib/developer-sdk';

const nova = new NovaApiClient({ baseUrl: 'https://your-domain.example', apiKey: process.env.NOVA_API_KEY! });
const { data } = await nova.request<{ items: unknown[]; nextCursor: string | null }>('/api/v1/projects');
for await (const project of nova.paginate('/api/v1/projects')) { /* at-least-once iteration */ }`}</code></pre>
      </section>
      <p className="mt-8 text-xs text-slate-500">Deployment lifecycle events (website.published, deployment.completed/failed) are defined and subscribed but are not emitted until a durable deployment worker exists; deployment creation is visible through GET endpoints immediately.</p>
    </main>
  );
}
