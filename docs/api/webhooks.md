# Webhooks

NOVA Studio delivers webhook events with **at-least-once** semantics using a
transactional outbox. Producers write the event and one delivery row per
matching endpoint **in a single database transaction**, so a crash can never
lose an event after business logic commits.

## Event catalog (version `2026-11-13`)

| Event | Emitted by |
| --- | --- |
| `project.created` | `POST /api/v1/projects` |
| `project.updated` | `PATCH /api/v1/projects/{id}` |
| `order.paid` | Admin payment approval |
| `order.refunded` | Admin refund / order status change |
| `workspace.member.invited` | Workspace member invitation |
| `ai.credits.low` | AI credit consumption crossing the threshold (env `AI_CREDITS_LOW_THRESHOLD`, default 50) |
| `website.published` | Defined, not yet emitted (see below) |
| `deployment.completed` | Defined, not yet emitted (see below) |
| `deployment.failed` | Defined, not yet emitted (see below) |

**Honest limitation:** deployment/website lifecycle events are fully
subscribable and type-checked, but no durable worker exists to observe
deployment completion, so those events are not emitted yet. Deployment state
is available immediately via `GET /api/v1/deployments/{id}`. Emission will
start automatically when the deployment worker is introduced.

## Payload

```json
{
  "id": "evt_0d1f…",
  "type": "order.paid",
  "version": "2026-11-13",
  "created_at": "2026-11-13T08:00:00.000Z",
  "environment": "PRODUCTION",
  "simulated": false,
  "data": { "orderId": "…", "orderNumber": "…", "totalMmk": 48000, "currency": "MMK" }
}
```

## Delivery engine

- First attempt fires inline (fire-and-forget); the durable engine
  (`processWebhookDeliveries`) processes PENDING/RETRYING rows that are due.
- Retries back off **1m → 5m → 30m → 2h → 8h → 24h** (6 scheduled retries,
  7 attempts total), then the delivery is **dead-lettered**. Workspace owners
  can retry a dead letter from the portal timeline.
- Each endpoint is limited to **120 deliveries/minute** to protect consumer
  infrastructure; excess deliveries are rescheduled a minute later.
- Duplicate dispatch is prevented with an optimistic claim
  (`updateMany` on unchanged `attemptCount`).
- Payloads over 256 KB fail fast to `FAILED`.

## Signatures

Headers on every delivery:

| Header | Content |
| --- | --- |
| `nova-signature` | `HMAC_SHA256(secret, "{timestamp}.{eventId}.{rawBody}")`, hex |
| `nova-timestamp` | Unix seconds of the signing time |
| `nova-event-id` | `evt_…` (matches payload `id`) |
| `nova-event-type` | Event type |

Verify with a **constant-time comparison** after checking
`|now − timestamp| ≤ 300s` (5-minute replay tolerance). Secrets rotate with
overlapping versions; the engine signs with the newest active secret.
See `examples/python/04_webhook_receiver.py` and
`src/lib/webhooks/signature.ts`.

## Endpoint requirements (SSRF policy)

Enforced both at registration and at delivery time:

- HTTPS only; ports **443 and 8443** only.
- No `user:pass@` in URLs, no control characters.
- Hostnames that are `localhost`, `*.localhost`, `*.local`, `*.internal` are
  rejected; every resolved IP is checked against private/loopback/
  link-local/metadata ranges (CGNAT and multicast included) — a hit aborts the
  delivery (`SSRF_BLOCKED`).
- Redirects are **never followed automatically**: each hop is re-validated
  (max 3), with 10 s timeouts and a 64 KB response cap.

## Consumer guidance

- Return **2xx only after** you have durably stored the event (or processed
  it). Any other status retries.
- Be idempotent on `nova-event-id` — at-least-once means duplicates happen.
- Keep handlers fast; slow endpoints increase retry pressure.
