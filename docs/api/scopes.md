# Scopes

Scopes are enforced **server-side on every route** — a credential's scope list
is intersected with the route's required scope using an exact match.

## Public scope list (fixed)

| Scope | Grants |
| --- | --- |
| `profile:read` | `GET /api/v1/me` |
| `workspaces:read` | `GET /api/v1/workspaces` |
| `projects:read` | List/get projects |
| `projects:write` | Create (share) and update projects |
| `websites:read` | List/get hosted websites |
| `deployments:read` | List/get deployments |
| `deployments:write` | Queue deployments (with Idempotency-Key) |
| `marketplace:read` | List published marketplace products |
| `ai_usage:read` | AI usage aggregates |
| `webhooks:read` | List webhook endpoints |
| `webhooks:write` | Create/update/rotate/delete webhook endpoints |

## Rules

1. **Fixed list.** OAuth scopes are clamped to this list; nothing outside it
   can ever be granted. There is deliberately no `admin:*` or `platform:*`
   scope — platform administration is not reachable via the public API.
2. **Immutability.** Scopes are fixed at credential creation. To change
   access, create a new credential and revoke the old one.
3. **Sandbox scope set.** `nova_sb_…` keys implicitly receive a reduced set:
   everything except `marketplace:read` and `ai_usage:read`, and they can only
   call `/api/v1/sandbox/*` paths anyway.
4. **Scope ≠ authorization.** A scope grants the *ability* to attempt an
   operation; workspace membership and roles are checked separately per call.
   A `projects:write` key belonging to a user who is not an EDITOR+ member of
   the target workspace still receives `403 FORBIDDEN`.
5. **Least privilege.** Create read-only keys for dashboards, add write scopes
   only to automation credentials, and prefer short-lived OAuth tokens for
   third-party apps.
