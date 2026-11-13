# Sandbox

The sandbox is an isolated environment for experimenting with the NOVA API and
webhooks without touching production data.

## Keys

Sandbox keys look like `nova_sb_…` and are created at
`/developers/sandbox`. They:

- are **restricted to `/api/v1/sandbox/*` paths** — any other path returns
  `SANDBOX_ONLY` (400);
- receive a **fixed, reduced scope set** (everything except
  `marketplace:read` and `ai_usage:read`) — no scope negotiation;
- have their **own monthly quota** (default 2,000 requests, tracked on the
  sandbox record itself, separate from workspace quotas);
- are individually disableable from `/developers/sandbox` and from the admin
  security console; disabling rejects every subsequent call with
  `CREDENTIAL_REVOKED`.

## Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/v1/sandbox/usage` | Quota, usage and the sandbox's effective scopes |
| `GET /api/v1/sandbox/events` | Simulated events for the sandbox workspace (cursor-paginated) |
| `POST /api/v1/sandbox/events` | Simulate an event: `{ "eventType": "order.paid", "data": {} }` → 202 |

`POST /api/v1/sandbox/events` **creates no production records** — it only
writes a clearly-labelled event (`environment: SANDBOX`, `simulated: true`)
and delivers it to the ACTIVE webhook endpoints of the sandbox's workspace,
so you can test verification and handler logic end-to-end.

## Isolation guarantees

- Sandbox requests never read or mutate production domain data; the only
  records created are sandbox-labelled webhook events and their deliveries.
- Sandbox events are excluded from production event listings (the events
  endpoint filters on `environment = SANDBOX`).
- A sandbox must be linked to a workspace to simulate deliveries; otherwise
  the API explains what to do.

## Suggested workflow

1. Create a sandbox and copy the key (shown once).
2. Create a webhook endpoint on a workspace you own with HTTPS 443/8443.
3. Point your local receiver at a public HTTPS tunnel (production endpoints
   must be HTTPS; the SSRF policy blocks localhost/private addresses).
4. `POST /api/v1/sandbox/events` for each event type you subscribe to.
5. When ready, create a production `nova_sk_` key with least-privilege scopes.
