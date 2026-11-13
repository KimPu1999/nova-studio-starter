# NOVA API v1 — Overview & architecture

NOVA Studio exposes a versioned public REST API under `/api/v1` for developers
and third-party integrations, plus an OAuth 2.0 authorization server for
delegated access.

## Design rules

1. **Server-side authorization only.** Scopes, workspace membership and roles
   are checked in every route handler. The client never supplies a workspace
   id as an authorization decision — workspace-scoped credentials are bound at
   creation, and every other caller is checked against live workspace
   membership in the database.
2. **Scopes are a fixed allow-list.** See [scopes.md](scopes.md). No
   platform-admin ability can be granted through the public API.
3. **Credentials are never stored in plaintext.** API keys, service-account
   secrets, OAuth secrets and webhook signing secrets are stored hashed or
   AES-256-GCM encrypted and shown exactly once at creation.
4. **No payment/payout operations.** Payment approval, refunds and payouts are
   admin-only platform operations and are deliberately not exposed via the API.
5. **Everything observable.** Every authenticated request records an
   `ApiUsageEvent` (method, endpoint, status, latency — never request bodies)
   and sensitive developer operations write an `ApiAuditLog` entry.

## Request pipeline

```
Request
  → requestId()              sanitized x-request-id (client-supplied, sanitized)
  → authenticateApiRequest()  4 credential kinds → ApiPrincipal
      ├─ credential lookup by SHA-256 hash (keys, service accounts, OAuth, sandbox)
      ├─ revocation / expiry checks
      ├─ scope check (exact scope match)
      └─ finishAuth: per-credential rate limit → per-user rate limit
                     → monthly quota → per-instance concurrency slot
  → handler                   Zod validation, tenant isolation, business logic
  → recordApiUsage()          telemetry + credential lastUsedAt/sandbox counter
  → releaseAuthSlot()         always in `finally`
```

## Envelope

```json
// success
{ "data": <payload>, "requestId": "req_…" }
// failure
{ "error": { "code": "FORBIDDEN", "message": "…", "requestId": "req_…" } }
```

The `requestId` is echoed in the `x-request-id` response header.

## Components

| Component | Code | Notes |
| --- | --- | --- |
| Auth core | `src/lib/api-v1.ts` | 4 credential kinds, scopes, envelope helpers |
| Rate limits | `src/lib/api/rate-limit.ts` | Atomic Postgres fixed-window counters |
| Concurrency | `src/lib/api/concurrency.ts` | Per-instance in-memory cap |
| Idempotency | `src/lib/api/idempotency.ts` | Unique-constraint backed guard |
| OAuth | `src/lib/api/oauth.ts` | Authorization code + PKCE, refresh rotation |
| Webhooks | `src/lib/webhooks/*` | Outbox, delivery engine, SSRF-safe fetch, signing |
| Audit | `src/lib/api/audit.ts` | `ApiAuditLog` writer |

## Machine-readable spec

`openapi.yaml` (OpenAPI 3.1) at the repository root documents every endpoint
and is validated against the implemented route table by `tests/openapi.test.ts`.

## Docs index

- [authentication.md](authentication.md)
- [oauth.md](oauth.md)
- [scopes.md](scopes.md)
- [rate-limits.md](rate-limits.md)
- [idempotency.md](idempotency.md)
- [webhooks.md](webhooks.md)
- [sandbox.md](sandbox.md)
- [versioning.md](versioning.md)
- [security.md](security.md)
