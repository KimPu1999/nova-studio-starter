# NOVA Studio — Operations Runbook

## Daily (finance admin)

- Review pending payment attempts: Admin → Billing → SaaS payments (and Payment reviews / Project invoices for legacy flows). Verify each against the actual wallet/bank statement — screenshots are records, not proof. Enter a verification note.
- Run or confirm the scheduled billing sweep ran in the last 26 h (Admin → Billing, or audit log `RUN_BILLING_SWEEP`).
- Process vendor payout requests: approve → complete (record method + reference) or reject (funds auto-release). Admin → Vendor payouts.
- Reconciliation: run and clear flagged duplicates/missing postings (Admin → Billing → Reconciliation).

## Weekly

- Review failed webhook deliveries and retry dead-lettered endpoints (Admin → Developers → Webhooks).
- Review security alerts/audit pages; check for repeated login throttle hits.
- Check disk usage of the storage volume and DB.

## Environment & secret rotation

| Secret | Rotation trigger | Procedure |
|---|---|---|
| `SESSION_SECRET` | suspected leak, 12 months | New secret invalidates encrypted webhook secrets — re-create webhook endpoints or re-encrypt during a maintenance window; sessions survive (tokens are DB-hashed with no key dependency). Schedule with users notified. |
| `BILLING_JOBS_TOKEN` | leak, 12 months | Update env + scheduler config; 5 min window. |
| DB password | leak, 12 months | Provider rotation; update `DATABASE_URL`/`DIRECT_URL`, restart app. |
| Admin passwords | on departure of any admin | `npm run admin:create` for new; password reset on account. Sessions auto-revoked by login/reset. |
| API keys (tenant-facing) | leak or on request | Tenant self-service rotate (shown once) in /developers/api-keys. |
| Webhook secrets | leak | Tenant rotates in /developers/webhooks; new secret delivered once. |

## Common incidents

| Symptom | First checks | Action |
|---|---|---|
| `/api/health` 503 | DB reachable? `prisma migrate status` | Restore DB connectivity; do not restart blindly if migrations pending. |
| Cron 503 | `BILLING_JOBS_TOKEN` unset in prod env | Set ≥ 24-char token, restart, re-run sweep. |
| Customer reports no entitlement after payment | Attempt status? invoice fully paid? | Entitlements only on FULL settlement (Phase 19). Verify remaining balance paid; approval of the final attempt grants. |
| Vendor payout "Insufficient available vendor balance" | Ledger sum for vendor | Earnings require verified marketplace orders; check refund reversals. |
| Payment reference rejected as duplicate | Prior rejected attempt used the reference | Ask customer for the new reference from their wallet history. |

## Known limitations (up to date with Phase 19)

1. MFA is not enforced (TOTP enrollment UI exists; login challenge not implemented) — pending Phase 20 or signed risk acceptance.
2. Transactional email (password reset, notifications) requires a mailer provider.
3. Workspace session/invitation policy values are stored but not enforced.
4. `/api/v1` concurrency limiter is per-instance (single-instance launch assumption).
5. Serverless deployment blocked until an object-storage adapter replaces the filesystem private-storage.
6. Partially-paid overdue invoices stay `PARTIALLY_PAID` (still payable/collectable).
