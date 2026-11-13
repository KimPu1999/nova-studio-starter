# Idempotency

Mutating endpoints that create a durable resource (currently
`POST /api/v1/deployments`) **require** an idempotency key:

```
Idempotency-Key: deploy-order-1234
```

Shape: 8–255 characters of `A–Z a–z 0–9 _ . -`. Anything else is rejected as
`INVALID_REQUEST`.

## Semantics

The key is scoped to `(principal, operation)` and **bound to the request
payload hash** (`sha256` of the JSON body). Behavior:

| Situation | Result |
| --- | --- |
| First request | Normal execution; the response (e.g. 201 + deployment) is stored |
| Retry, same key + same payload, completed | **REPLAY** — the stored response is returned with its original status code |
| Same key, different payload | `409 IDEMPOTENCY_CONFLICT` |
| Same key + payload, still in flight | `409 RESOURCE_LOCKED` — retry shortly |
| Request that failed with a server error | The lock is released; retrying executes normally |
| In-flight request that crashed (no completion for 5 minutes) | Slot reclaimed; retry executes |
| Key older than 24 hours | Retired; the key becomes reusable |

The guard is backed by a database **unique constraint**, so two concurrent
requests with the same key can never both perform the mutation — only one
wins, the other is replayed or locked.

## Client guidance

1. Generate the key **once per logical operation** (e.g. a UUID) and persist
   it alongside your own record of the request.
2. Reuse the key for **every retry** of that operation — including retries
   after network errors, timeouts and 5xx.
3. Never reuse a key for a different request (you will get
   `IDEMPOTENCY_CONFLICT`, which is a bug in your client, not the API).
4. Treat replayed responses as final results exactly like fresh ones.
