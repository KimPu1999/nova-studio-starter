# NOVA Studio — Usage Metering & Quotas

## Source of truth

Phase 12–17 usage records remain the source of truth:
`AiUsageRecord` (tokens + credits), `ApiUsageEvent`, `HostingUsageRecord`,
`WebsiteDeployment`. Phase 18 meters them into billing tables — it never
replaces or fabricates provider usage.

## Meters (`BillingUsageMeter`)

`AI_TOKENS`, `AI_CREDITS`, `API_REQUESTS`, `HOSTING_STORAGE_MB`,
`HOSTING_BANDWIDTH_MB`, `DEPLOYMENTS` (seeded idempotently).

## Idempotent ingestion

`ingestUsageEvent()`:

- Records `BillingUsageEvent` with `@@unique([meterId, sourceEventId])` —
  the source record id (e.g. `ai-usage:{recordId}`) is the dedup key, so the
  same event can never be counted twice, even across retries or concurrent
  syncs.
- Upserts the monthly `BillingUsageAggregate` (UTC month period,
  `[periodStart, periodEnd)`) in the same transaction.
- Distinguishes `ESTIMATED` vs `VERIFIED` quality (`isEstimated` on the
  aggregate) — estimated usage is flagged, never silently billed.

Replays return `false` (no double-count). `syncExistingUsageRecords()` backfills
meters from historical records idempotently (source ids are stable).

## Quotas

Limits come from entitlements (`resolveEntitlements`) — i.e. from the verified
subscription state — never re-derived inline:

| Meter | Entitlement |
| --- | --- |
| API_REQUESTS | `api.requests.monthly` |
| AI_CREDITS | `ai.credits.monthly` |
| HOSTING_STORAGE_MB / BANDWIDTH_MB | `storage.mb` / `bandwidth.mb` |
| DEPLOYMENTS | `websites.max` |

`assertWithinQuota(limit, current, requested)` is a pure server-side guard;
`null` limits mean unlimited. Enforcement points (Phase 14 hosting services,
Phase 17 API quota path) check quotas server-side before consuming; the API
path prefers the billing entitlement over the legacy `ApiQuotaPolicy`.

## Overage policy

Overage **never triggers automatic billing** — no surprise charges. Excess
consumption either (a) blocks the operation when a hard quota is configured, or
(b) is allowed and surfaced to admins/reports as a soft overage signal for an
upgrade conversation. There is no per-unit overage invoicing in this phase.

## Integration notes

- Hosting/storage/bandwidth continue to be measured by Phase 14 services;
  billing meters consume those records — the two systems stay consistent by
  construction (single source, idempotent fan-out).
- The `/billing/usage` dashboard shows the customer's period usage, quota bars,
  and estimated/verified flags (UTC months, Yangon display).
