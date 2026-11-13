# Usage Metering & Quotas (Phase 18)

## Meters

| Code | Unit | Source of truth (existing) |
| --- | --- | --- |
| `AI_TOKENS` | tokens | `AiUsageRecord.inputTokens + outputTokens` |
| `AI_CREDITS` | credits | `AiUsageRecord.creditsConsumed` |
| `API_REQUESTS` | requests | `ApiUsageEvent` (non-rate-limited) |
| `HOSTING_STORAGE_MB` | MB | `HostingUsageRecord.storageMb` |
| `HOSTING_BANDWIDTH_MB` | MB | `HostingUsageRecord.bandwidthMb` |
| `DEPLOYMENTS` | deployments | `WebsiteDeployment` (READY/PUBLISHED) |

Existing records remain the source of truth. `syncExistingUsageRecords()`
backfills them into `BillingUsageEvent` rows keyed by
`sourceEventId = {source}:{recordId}` — re-running never double-counts.

## Idempotent ingestion

`ingestUsageEvent({meterCode, sourceEventId, subjectType, subjectId, quantity,
quality, occurredAt})`:

- Uniqueness: `@@unique([meterId, sourceEventId])` — replay returns `false`
  without touching aggregates.
- Aggregates: `BillingUsageAggregate` upserted per
  (meter, subject, UTC month period) with atomic increments.
- `quality`: `ESTIMATED` vs `VERIFIED` distinguishes provider-estimated usage
  from verified records; nothing is fabricated.

## Quotas

- Limits come exclusively from entitlements (`resolveEntitlements`) derived
  from the **verified subscription** state.
- `checkUsageQuota(...)` returns `{allowed, limit, current, overage}`.
- **No surprise overage billing**: overage never creates charges; it blocks
  the guarded action and/or surfaces an upgrade prompt.
- The Phase 17 API pipeline (`src/lib/api-v1.ts`) now resolves its monthly
  workspace limit as: billing entitlement `api.requests.monthly` →
  `ApiQuotaPolicy` → platform default — server-side only, no bypass path from
  the client.

## Hosting & API integration notes

- Hosting quotas (`websitesLimit`, `customDomainsLimit`, `storageMb`,
  `bandwidthMb`) are exposed via entitlements for Phase 14 services to enforce
  server-side. Downgrades **disable** entitlement flags but never delete
  websites, domains, or deployments (documented non-destructive policy).
- `assertSeatAvailable` (seat guard) is wired into the workspace invitation
  action inside the invitation transaction, so concurrent invitations cannot
  bypass seat limits. Invited + pending invitations both consume seats
  (documented policy). Overage seats are never auto-charged.
