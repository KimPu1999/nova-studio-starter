# NOVA Studio — Subscription Lifecycle

## States

`INCOMPLETE → PENDING_PAYMENT → ACTIVE → PAST_DUE → GRACE_PERIOD →
SUSPENDED → (reactivation) ACTIVE`, with terminal `CANCELLED` / `EXPIRED`.

Valid transitions are declared in `SUBSCRIPTION_TRANSITIONS`
(`src/lib/billing/constants.ts`) and enforced by `assertTransition()`.
Terminal states have no outgoing transitions; a cancelled/expired subscription
can never be silently reactivated — a new subscription must be created.

## Scopes

`BillingScopeType`: `PERSONAL` (a user), `WORKSPACE` (an organization's
workspace), `WEBSITE` (a hosted site). Each scope holds at most one
non-terminal subscription: the `slotKey` unique column (`SLOT:USER:{id}`,
`SLOT:WS:{id}`, `SITE:{id}`) reserves the scope while any of
`INCOMPLETE/PENDING_PAYMENT/ACTIVE/PAST_DUE/GRACE_PERIOD/SUSPENDED` holds it,
and is released on cancel/expire — duplicate active subscriptions for the same
scope are impossible, even under concurrency.

## Creation

`startSubscription()`:

1. Resolves the ACTIVE plan version and integer price for the chosen cycle.
2. Creates a `PENDING_PAYMENT` subscription + `PLAN_BASE` item (idempotent:
   same scope always resolves to the same subscription).
3. Creates the first invoice (idempotency key
   `invoice:initial:{subscriptionId}:{periodStart}`) and issues it.

**Free plans** skip payment entirely and are activated immediately
(`priceMmk === 0`); their periods advance idempotently via
`advanceFreeSubscriptions()`.

## Activation / renewal — only from VERIFIED payments

`activateSubscriptionFromVerifiedPayment(tx, …)` runs **inside the finance
reviewer's approval transaction** (see payments.md). It:

1. Validates the state transition.
2. Syncs entitlements to ACTIVE and invalidates the entitlement cache.
3. Sets the period window and `lastRenewalKey` = the invoice idempotency key,
   making replays no-ops (renewal processing is idempotent).

Unpaid renewal invoices are **never** marked paid, and manual-payment
subscriptions are never auto-renewed as paid — the sweep only generates
invoices and lifecycle states.

## Plan changes

`requestPlanChange()` (ACTIVE/PAST_DUE/GRACE_PERIOD only):

- Computes a prorated delta on monthly-normalized prices for the remainder of
  the period; downgrades create a zero-amount adjustment invoice (no automatic
  refund) and are otherwise handled via credit notes.
- Creates a `PLAN_CHANGE` invoice whose metadata pins
  `targetVersionId/targetPriceMmk`. Entitlements keep the **current** plan
  until the invoice is verified; the verifier then applies the swap
  (`applyPlanChangeFromVerifiedPayment`). Historical invoices keep their
  original version.

## Cancellation, grace, suspension, reactivation

- `cancelSubscription(immediate=false)` sets `cancelAtPeriodEnd`; the sweep
  expires it at period end (entitlements disabled, data preserved, `slotKey`
  released). `immediate=true` cancels now.
- Lifecycle sweep (`runSubscriptionLifecycleSweep`): ACTIVE with an ended
  period → `GRACE_PERIOD` (default 7 days, `GRACE_PERIOD_DAYS`) with
  notifications; grace lapse → `SUSPENDED` (entitlements disabled, data
  preserved — nothing is deleted).
- Reactivation: paying the outstanding renewal invoice while suspended moves
  the subscription back to ACTIVE via the verified-payment path
  (`SUSPENDED → ACTIVE` is a legal transition). The reactivation behavior is
  documented here: no new subscription is required; entitlements re-enable on
  the same verified transaction.

## History

Subscriptions are never deleted; rows keep full period/audit history, and every
transition writes `BillingAuditLog` + customer notifications.
