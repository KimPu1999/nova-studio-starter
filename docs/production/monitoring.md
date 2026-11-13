# NOVA Studio — Monitoring & Observability

## Current state (honest)

| Capability | Status | Notes |
|---|---|---|
| Health check | **ACTIVE** | `GET /api/health` → `{status:'ok'\|'degraded'}`, 503 + DB failure detail suppressed; `no-store`. |
| Structured logs | PARTIAL | Next.js request logs + zero `console.*` in app code (no accidental PII/secret leaks). No JSON log pipeline configured yet. |
| Request IDs | NOT CONFIGURED | Needs middleware-generated `x-request-id` propagation in Phase 20. |
| Error tracking (Sentry or equivalent) | NOT CONFIGURED | Requires account + DSN + integration; not claimed as active. |
| Job monitoring | PARTIAL | Billing sweep returns counters and writes a `BillingAuditLog` row (`RUN_BILLING_SWEEP`); alerting on missed runs not wired. |
| Webhook monitoring | PARTIAL | Delivery attempts recorded with status/attempts in `WebhookDelivery`; no alerting threshold configured. |
| Database monitoring | NOT CONFIGURED | Provider-side (managed Postgres) CPU/connections/storage alerts. |
| Billing failure alerts | PARTIAL | Customer notifications exist (rejected payment, refund decisions); ops-side alerting (e.g. ledger anomalies) not wired. |
| Security alerts | PARTIAL | `admin/security/alerts` dashboard aggregates credential events; external alerting not configured. |

## Redaction rules

- Never log: passwords, tokens, full API keys, webhook secrets, wallet numbers, full payment references. Log IDs, prefixes, and counts instead. Current codebase logs nothing by default — keep it that way until a redaction-safe pipeline exists.
- Personal data (emails, names) must not be added to logs without a documented retention purpose (see `docs/security/privacy.md`, `retention.md`).

## Alert thresholds (proposed — enforce once an alert channel exists)

| Signal | Threshold | Severity |
|---|---|---|
| `/api/health` non-200 for 2 consecutive probes | 2 min | Page |
| 5xx rate | > 1% over 5 min | Page |
| Billing sweep not run in 26 h | 1 missed day | Page (financial) |
| Failed webhook deliveries | > 10% over 15 min | High |
| Reconciliation report with `duplicateReferences > 0` or missing-ledger items | any | Page (financial) |
| Vendor ledger negative balance | any | Page |
| DB connections > 80% of pool limit | 10 min | High |
| Disk (storage dir or DB volume) | > 85% | High |

## Incident escalation (summary; full runbook in `docs/security/incident-response.md`)

1. **Detect** via health/alert channel or user report.
2. **Triage**: severity S1 (money/tenant-data exposure, total outage) → immediate rollback decision per `rollback.md`; S2 degraded feature; S3 cosmetic.
3. **Communicate**: status note to affected tenants for S1/S2.
4. **Postmortem**: written within 3 business days for S1, root cause + corrective actions recorded.

**Do not claim monitoring is "active" beyond the health endpoint until the remaining channels are configured and have fired a test alert.**
