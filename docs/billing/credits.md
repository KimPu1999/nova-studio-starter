# AI Credits (Phase 18)

Phase 18 **reuses** the Phase 13 AI credit infrastructure — there are no
parallel balances:

- Wallet: `AiCreditWallet` (`balance`, `reserved`).
- Ledger: `AiCreditLedger` (append-only, unique `idempotencyKey`).
- Spend path: `reserveCredits` / `settleReservedCredits` /
  `releaseReservedCredits` from `src/lib/ai/credits.ts` (unchanged).

## Purchase flow

1. Catalog: `BillingCreditPackage` (seeded: 1K/5K(+500)/20K(+4K) credits).
2. `purchaseCreditPackage(user, packageId, idempotencyKey)` — creates an
   ISSUED `CREDIT_PACKAGE` invoice; credits count is stored in invoice
   `metadata` and the line description. Customer pays manually.
3. On finance verification, `grantCreditsForVerifiedInvoice(tx, invoiceId, …)`
   runs **inside the approval transaction**:
   - idempotency key `billing:credits:{invoiceId}` (replay-safe),
   - writes one `CREDIT_PURCHASE` ledger entry (positive),
   - increments `AiCreditWallet.balance`.
4. History surfaces verified grants at `/billing/credits`
   (`getCreditPurchaseHistory`) and consumption at `/billing/usage`.

## Refunds & reversals

`completeCreditNote` for a `CREDIT_PACKAGE` invoice reverses credits with a
`CREDIT_REFUND` ledger entry, capped at the **current wallet balance** so the
balance can never go negative; the reversed amount is recorded on the credit
note (`creditsReversed`).

## Plan allowances

`monthlyAiCredits` from the subscription's plan version is surfaced as the
`ai.credits.monthly` entitlement and shown on `/billing/usage` against the
period's `AI_CREDITS` meter (metered from `AiUsageRecord.creditsConsumed` —
no fabricated usage). Quota breaches do **not** auto-bill; they block further
included-quota features per the entitlement guard and surface as an upgrade
signal.
