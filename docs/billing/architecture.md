# Billing Architecture (Phase 18)

NOVA Studio's unified billing platform consolidates four previously separate
financial stacks (marketplace orders, project invoices, hosting payments,
workspace subscriptions) behind one account, plan, subscription, invoice,
payment-verification, ledger and reconciliation layer.

## Stack overview

```
BillingAccount (PERSONAL | ORGANIZATION)          ← unified identity for money
 └─ BillingSubscription (scope: PERSONAL | WORKSPACE | WEBSITE)
     └─ BillingSubscriptionItem
 └─ BillingInvoice → BillingInvoiceLine
     └─ BillingPaymentAttempt (KBZPay / WavePay / bank)  ← manual verification
     └─ BillingCreditNote (refunds / credit adjustments)
 └─ BillingEntitlement (derived, cached feature limits)
 └─ BillingLedgerEntry (append-only financial record)

BillingPlan → BillingPlanVersion (versioned integer-MMK pricing)
BillingUsageMeter → BillingUsageEvent → BillingUsageAggregate
BillingReconciliation → BillingReconciliationItem
BillingAuditLog (every sensitive action)
BillingCreditPackage (AI credit catalog)
```

## Design principles

1. **Integer MMK only.** Every monetary field is a safe integer (kyat). No
   floats anywhere in the billing domain.
2. **Immutable financial snapshots.** Issued invoices freeze a `snapshot` of
   lines and totals; plan prices are versioned via `BillingPlanVersion` so
   historical invoices keep the price that was current when issued.
3. **No paid access before verified payment.** Subscription activation, credit
   grants and plan changes happen only inside the *verified approval*
   transaction in `src/lib/billing/payments.ts`.
4. **Screenshots are never proof.** Uploaded proofs are stored privately
   (`private-storage`) and shown only to finance reviewers. Approval requires
   the reviewer to confirm the transfer in the actual KBZPay/WavePay/bank
   history, recorded as a mandatory `verificationNote`.
5. **Idempotent financial transitions.** Every create/approve/renew path is
   keyed by a unique `idempotencyKey` (DB constraint), so retries cannot
   double-charge, double-grant, or double-post.
6. **Append-only ledger.** `BillingLedgerEntry` is never updated or deleted.
   Unverified payments never appear as cash or revenue.
7. **Marketplace/vendor money stays separate.** Vendor commissions live in
   `VendorLedgerEntry`/`VendorEarning` (Phase 12) and are reported as
   liabilities, never as platform revenue.
8. **Tenant isolation.** Billing pages resolve accounts through
   `requireBillingAccountAccess` (owner or organization billing member).
   Admin access is split: platform admins (plans/subscriptions/invoices) and
   finance admins (verification/refunds/reconciliation/reports) via the
   `FINANCE_ADMIN` role.

## Module map (`src/lib/billing/`)

| Module | Responsibility |
| --- | --- |
| `constants.ts` | State machine, feature keys, period/MRR math, scope keys |
| `rbac.ts` | `requireBillingViewer` / `requireBillingPlatformAdmin` / `requireFinanceAdmin`, separation-of-duties assert |
| `accounts.ts` | Billing accounts, ownership, workspace→org billing |
| `plans.ts` | Plan catalog, version creation/activation, plan-change validation |
| `subscriptions.ts` | Lifecycle engine, plan changes, lifecycle sweep, free-plan advance |
| `invoices.ts` | Draft→issue, totals validation, payment application, void, overdue |
| `payments.ts` | Payment submission, finance verification, transactional entitlements |
| `credits.ts` | Credit package purchase (reuses Phase 13 wallet) |
| `usage.ts` | Meter registry, idempotent ingestion, aggregates, quota checks, backfill |
| `entitlements.ts` | Entitlement derivation/sync, safe cache, quota guard |
| `seats.ts` | Transactional seat guard for workspace invitations |
| `refunds.ts` | Credit notes: request → review → payout confirmation |
| `ledger.ts` | Append-only postings (cash, deferred/recognized revenue, refunds) |
| `reconciliation.ts` | Statement import, matching, duplicate/integrity detection |
| `reports.ts` | Revenue metrics, vendor liabilities |
| `jobs.ts` | Renewal cycle, lifecycle sweep, usage sync (idempotent job runner) |
| `audit.ts` | `BillingAuditLog` + notification helpers |
| `validation.ts` | Zod schemas for all billing forms |

## What was deliberately NOT done

- No automatic charging, no payment gateway integration, no tax engine, no
  accounting-standard export. Myanmar tax compliance requires verified
  jurisdictional advice — invoices carry an optional `taxMmk` field only.
- No durable scheduler/queue: jobs are idempotent endpoints/actions that any
  external cron can call (see `docs/billing/subscriptions.md`).
- Existing marketplace, project, hosting and LMS payment flows are untouched;
  Phase 18 runs alongside them and future phases can migrate them onto the
  unified ledger.
