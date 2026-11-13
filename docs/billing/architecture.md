# NOVA Studio — Unified Billing Architecture

Phase 18 introduces a single SaaS billing and monetization platform on top of
the existing NOVA Studio codebase (Phases 1–17). It unifies personal and
organization subscriptions, seats, hosting, AI credits, API usage, invoices,
manual payment verification, refunds, revenue analytics and reconciliation.

## Design principles

1. **Integer MMK everywhere.** Every monetary amount is a non-negative safe
   integer (kyat). No floats, no decimals. `assertIntMmk()` guards every entry
   point (`src/lib/billing/constants.ts`).
2. **UTC storage, Asia/Yangon display.** All timestamps are stored in UTC;
   `Asia/Yangon (+06:30)` is a display-only concern.
3. **Verified payment before entitlements.** Paid entitlements are granted only
   inside the finance-reviewer's approval transaction. Screenshots are records
   for reviewers, never proof.
4. **Idempotency.** Every financial transition (invoice, payment attempt,
   ledger posting, credit grant, usage event, renewal) carries an idempotency
   key backed by a DB unique constraint. Retries cannot double-apply.
5. **Immutable financial history.** Issued invoices freeze a snapshot;
   corrections go through credit notes, never edits. Ledger entries are
   append-only. Audit logs are never deleted.
6. **Separation of ledgers.** Platform billing money lives in
   `BillingLedgerEntry`; vendor commission liabilities stay in the Phase 12
   vendor ledger (`VendorLedgerEntry`, `VendorEarning`, payouts). The two are
   never mixed, so vendor liabilities cannot be misreported as revenue.
7. **Server-side authorization.** Every page and action resolves permissions
   through `src/lib/billing/rbac.ts` and `requireBillingAccountAccess()`.

## Module map (`src/lib/billing/`)

| Module | Responsibility |
| --- | --- |
| `constants.ts` | Status enums, lifecycle transitions, feature keys, UTC period helpers, MRR math |
| `accounts.ts` | BillingAccount creation/access (personal + organization), tenant isolation |
| `plans.ts` | Plan catalog, versioned pricing, plan-change validation |
| `subscriptions.ts` | Lifecycle state machine, activation/renewal from verified payments, plan changes, lifecycle sweep |
| `seats.ts` | Seat counting + transactional seat-limit enforcement (reuses Phase 15 memberships) |
| `usage.ts` | Idempotent usage meters/events/aggregates + backfill from Phase 12–17 records |
| `credits.ts` | AI credit package catalog + purchase invoices (Phase 13 wallet reused) |
| `invoices.ts` | Draft→issued snapshots, totals validation, payment application, void, ledger settlement |
| `payments.ts` | Manual payment submission + finance verification workflow (KBZPay / WavePay / bank) |
| `refunds.ts` | Credit notes: request → review → payout confirmation |
| `ledger.ts` | Append-only financial ledger with idempotent postings |
| `entitlements.ts` | Derived entitlements from verified subscription state, cache + invalidation |
| `reconciliation.ts` | Statement import (CSV), deterministic matching, duplicate detection |
| `reports.ts` | Revenue analytics from verified ledger data only |
| `jobs.ts` | Idempotent renewal/lifecycle/usage sweep (admin action or BILLING_JOBS_TOKEN endpoint) |
| `rbac.ts` | FINANCE_ADMIN / platform-admin role gates, separation of duties |
| `audit.ts` | Append-only BillingAuditLog + in-app notifications |

## Data model (Phase 18 tables)

`BillingAccount`, `BillingPlan`, `BillingPlanVersion`, `BillingSubscription`,
`BillingSubscriptionItem`, `BillingInvoice`, `BillingInvoiceLine`,
`BillingPaymentAttempt`, `BillingCreditPackage`, `BillingCreditNote`,
`BillingUsageMeter`, `BillingUsageEvent`, `BillingUsageAggregate`,
`BillingEntitlement`, `BillingLedgerEntry`, `BillingReconciliation`,
`BillingReconciliationItem`, `BillingAuditLog`.

All use UUID primary keys, foreign keys with `Restrict`/`SetNull` deletes, and
unique idempotency constraints. See `prisma/migrations/20261114000000_phase18_saas_billing`
and `20261114010000_phase18_invoice_metadata`.

## Surfaces

- Customer: `/billing`, `/billing/plans`, `/billing/subscription`,
  `/billing/invoices`, `/billing/invoices/[id]`, `/billing/payments`,
  `/billing/usage`, `/billing/credits`, `/billing/settings`.
- Admin: `/admin/billing` (+ `plans`, `subscriptions`, `invoices`,
  `payments`, `refunds`, `reconciliation`, `reports`, `audit`).
- Payment proofs are served only from
  `/admin/billing/payments/proof?key=…` to SUPER_ADMIN / FINANCE_ADMIN.

## Known limitations (honest disclosure)

- No PSP integration: payments are manual (KBZPay/WavePay/bank) and verified by
  finance staff. No automatic charging exists anywhere in the platform.
- No durable scheduler: jobs are idempotent and must be triggered by an admin
  action or an external cron hitting the guarded endpoint.
- Tax handling stores a tax amount per invoice but does not claim jurisdictional
  VAT compliance.
- Deferred revenue recognition is simplified (recognized at period end by the
  sweep); consult an accountant before using figures for statutory reporting.
