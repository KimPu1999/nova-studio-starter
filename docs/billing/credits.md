# NOVA Studio — AI Credit Purchases

## Reuses the Phase 13 wallet — no parallel balances

Credit packages purchase into the existing `AiCreditWallet` /
`AiCreditLedger` (Phase 13). Billing does **not** create a second balance
system; `/billing/credits` reads the same wallet the AI builder consumes from.

## Catalog

`BillingCreditPackage` rows (seeded idempotently by `prisma/billing-seed.ts`):

| Code | Credits | Bonus | Price |
| --- | --- | --- | --- |
| CREDITS_1K | 1,000 | 0 | 5,000 MMK |
| CREDITS_5K | 5,000 | 500 | 25,000 MMK |
| CREDITS_20K | 20,000 | 4,000 | 90,000 MMK |

Admins manage packages as data; nothing is hardcoded in business logic.

## Purchase flow

`purchaseCreditPackage(user, packageId, idempotencyKey)`:

1. Validates the package is active and its price/credits are integer MMK.
2. Resolves (or creates) the user's personal `BillingAccount`.
3. Creates a `CREDIT_PACKAGE`-purpose invoice with an `AI_CREDITS` line and
   issues it (immutable snapshot). Metadata stores `credits` (total incl.
   bonus) and `packageId` for the grant step.

Payment is manual (see payments.md). **Credits appear only after finance
verification**: `grantCreditsForVerifiedInvoice()` runs inside the approval
transaction and:

- is idempotent by the `AiCreditLedger.idempotencyKey`
  `billing:credits:{invoiceId}` — a replay cannot double-grant;
- upserts the user's Phase 13 wallet and appends a `CREDIT_PURCHASE` ledger
  entry before incrementing the balance (atomic, no negative balances).

## Usage history

- `/billing/credits` — wallet balance (live) + purchase/grant/refund ledger
  entries (`CREDIT_PURCHASE`, `CREDIT_GRANT`, `CREDIT_REFUND`).
- `/billing/usage` — consumption entries (`CREDIT_RESERVATION`,
  `CREDIT_CONSUMPTION`, `CREDIT_RELEASE`).

## Refunds and reversals

Refunding a credit-package invoice reverses credits **without pushing the
wallet negative**: the reversal is capped at `min(granted, current balance)`
(`creditsReversed` records the actual amount). Purchases reserved/atomically
settled by Phase 13 flows are untouched by billing.

## Double-spend protection

Credit consumption continues to be governed by the Phase 13
reservation → settlement flow (`CREDIT_RESERVATION`/`CREDIT_CONSUMPTION`
ledger entries). Billing adds no bypass and does not write consumption
entries itself.
