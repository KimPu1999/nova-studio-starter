# Rate limits & quotas

All limiting is enforced with **atomic Postgres counters**
(`INSERT … ON CONFLICT DO UPDATE … RETURNING count`), so the limits are
consistent across every app instance — there is no per-instance drift for
rate limits or quotas.

## Windows

| Limit | Value | Window | Key |
| --- | --- | --- | --- |
| Per credential | 60 / min (env `API_RATE_PER_CREDENTIAL_PER_MINUTE`) | fixed minute | credential id |
| Per user (defense in depth) | 240 / min (env `API_RATE_PER_USER_PER_MINUTE`) | fixed minute | user id |
| Workspace monthly quota | 50,000 default (env `API_MONTHLY_QUOTA_DEFAULT`) | calendar month (UTC) | workspace id (or user id when unbound) |
| Sandbox monthly quota | 2,000 (env `API_SANDBOX_MONTHLY_QUOTA`) | calendar month | the sandbox record |
| Concurrency cap | 10 per credential (env `API_MAX_CONCURRENCY`) | instantaneous | credential id |

Workspace admins can override the monthly quota per workspace
(`ApiQuotaPolicy`, editable at `/admin/developers/limits`). The quota counter
key is the **workspace**, not the credential, so rotating keys cannot bypass
it. Service accounts and every workspace-bound key of a workspace share the
same monthly counter.

## 429 responses

```
HTTP/1.1 429 Too Many Requests
Retry-After: 23
{ "error": { "code": "RATE_LIMITED" | "QUOTA_EXCEEDED" | "CONCURRENCY_LIMITED",
             "message": "…", "requestId": "…" } }
```

- `RATE_LIMITED` — minute window exceeded; honor `Retry-After`.
- `QUOTA_EXCEEDED` — monthly quota exhausted (Retry-After points at month
  end); increase the quota or reduce request volume.
- `CONCURRENCY_LIMITED` — too many simultaneous in-flight requests on one
  credential; parallelize less.

## Documented limitations

- **Concurrency cap is per instance.** The in-flight cap lives in process
  memory; with N app instances the effective cap is `limit × N`. Rate limits
  and quotas are not affected (they are Postgres-backed).
- Fixed-window counters allow a small burst at window boundaries (up to 2× the
  limit across a boundary second). Sliding-window enforcement is a future
  hardening step.
- Counter rows (`ApiRateCounter`) accumulate per scope/key/window and should
  be pruned by a scheduled job (e.g. delete rows older than ~35 days) to keep
  the table small. Quota dashboards read the same counters with
  `rateLimitPeek`, which does not consume requests.

## Client guidance

- Serialize background jobs through one credential at modest parallelism
  rather than opening dozens of concurrent connections.
- Back off exponentially on 429 and honor `Retry-After` exactly.
- Monitor usage at `/developers/usage` (per-credential, per-endpoint,
  per-status breakdowns) — it is built from the same `ApiUsageEvent` table.
