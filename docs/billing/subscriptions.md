# Subscription Lifecycle (Phase 18)

## States

```
INCOMPLETE ──▶ PENDING_PAYMENT ──▶ ACTIVE ──▶ PAST_DUE ──▶ GRACE_PERIOD
                                   │  ▲          │             │
                                   │  └──────────┴──(late verified payment)
                                   ▼                             ▼
                              CANCELLED                    SUSPENDED ──(verified)──▶ ACTIVE
                              EXPIRED ◀──(period end w/ cancelAtPeriodEnd)──┘
```

Valid transitions are enforced by `assertTransition` (`SUBSCRIPTION_TRANSITIONS`
in `src/lib/billing/constants.ts`). `CANCELLED` and `EXPIRED` are terminal; a
new subscription must be created instead.

## Creation

- `startSubscription({accountId, scopeType, scopeId, planId, cycle})` →
  `PENDING_PAYMENT` subscription + first invoice (paid plans) or immediate
  `ACTIVE` (free plans, no payment required).
- **One non-terminal subscription per scope.** The `slotKey` unique constraint
  (`SLOT:USER:x` / `SLOT:WS:x` / `SLOT:SITE:x`) reserves the scope; it is
  released (set to `null`) on cancel/expire, so concurrent creates cannot
  produce duplicate active subscriptions.

## Activation (manual-verification flow)

`reviewPaymentAttempt(APPROVED)` runs **one transaction**:
1. Claims the attempt (`PENDING_REVIEW → APPROVED`, conditional update —
   concurrent reviews cannot both win).
2. Applies the payment to the invoice (overpayment-guarded).
3. Posts ledger entries (cash receipt + deferred revenue).
4. Activates/renews the subscription: `status=ACTIVE`, advances
   `currentPeriodStart/End`, sets `renewsAt`, records `lastRenewalKey`.
5. Syncs entitlements and (for credit packages) grants credits.

Renewals are idempotent: the renewal invoice idempotency key is
`renewal:{subscriptionId}:{periodStart-ISO-date}` and the subscription's
`lastRenewalKey` prevents double application. **Unpaid renewals are never
marked as paid** — the subscription stays in `GRACE_PERIOD`/`PAST_DUE` until a
verified payment arrives.

## Grace & suspension

- When a period lapses unpaid, `runSubscriptionLifecycleSweep` moves the
  subscription to `GRACE_PERIOD` with `graceUntil = now + 7 days`
  (`GRACE_PERIOD_DAYS`). Entitlements stay *enabled* during grace.
- After grace lapses: `SUSPENDED` — entitlements are **disabled** (soft flag,
  non-destructive; customer data is never deleted).
- Reactivation = paying the outstanding invoice; verification sets `ACTIVE`
  and re-enables entitlements (documented reactivation behavior).
- `cancelAtPeriodEnd` → `EXPIRED` at period end; entitlements disabled.

## Background jobs (no scheduler in this starter — honest limitation)

`runBillingSweep` (`src/lib/billing/jobs.ts`) is fully idempotent and performs:
renewal invoice generation (12-day lookahead), overdue marking, lifecycle
sweep, free-plan period advance, and usage backfill. Trigger it via:

- Admin UI button on `/admin/billing` (finance admin), or
- Any external cron hitting an authorized surface (e.g. wrapping
  `runBillingSweep` behind `BILLING_JOBS_TOKEN`-guarded auth — left to
  deployment; recommended: GitHub Actions cron calling the admin action
  endpoint or a small protected route).

Duplicate runs are safe: renewal invoices and sweeps are keyed idempotently.

## Timezones

All storage/comparison is UTC. Display may render Asia/Yangon (+06:30) but
renewal windows, grace deadlines and reporting periods are UTC-month based.
