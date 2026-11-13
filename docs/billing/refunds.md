# NOVA Studio — Refunds & Credit Notes

## Lifecycle

`REQUESTED → APPROVED → ISSUED → COMPLETED` (or `REJECTED` / `VOID`).

A credit note is **COMPLETED only after the actual payout is confirmed** —
method + transaction reference + confirmer. Approval alone never marks money
as returned.

## Types

`REFUND` (money returned to the customer) and `CREDIT_ADJUSTMENT`
(account credit / goodwill, tracked without a cash payout confirmation).

## Requesting

`requestCreditNote()` validates eligibility only:

- Invoice must be `PAID` or `PARTIALLY_PAID` (unpaid invoices are voided, not
  refunded).
- Refundable amount = `amountPaidMmk` − (sum of non-rejected credit notes).
  Refunds can never exceed the eligible paid amount — enforced at request,
  and totals are re-derived from completed notes for reporting.
- A reason of at least 10 characters is required.
- Idempotency key prevents duplicate requests from double clicks/retries.
- Caller must pass `requireBillingAccountAccess()` (tenant isolation).

## Review (finance only)

`reviewCreditNote()`:

- Rejects self-review (`assertNotSelfApproval`) — the requester can never
  approve their own refund, including admins who requested on someone's behalf.
- Conditional claim (`REQUESTED → APPROVED`) makes concurrent reviews safe.
- Approval reserves the amount and issues the note (`ISSUED`), but issues no
  money and posts no ledger entries yet.
- Rejection requires a note; requester is notified.

## Payout confirmation

`completeCreditNote()` (finance only, never the requester):

1. Requires `payoutMethod` + `payoutReference` (≥ 4 chars).
2. `ISSUED → COMPLETED` inside one transaction; posts the append-only
   `REFUND` ledger entry (DEBIT) with idempotency key `refund:{creditNoteId}`
   — double payouts are impossible.
3. Policy-driven reversals:
   - **Subscription invoices**: with `reverseEntitlement`, a full refund of an
     active period cancels the subscription and disables its entitlements
     (non-destructive; data is preserved).
   - **Credit packages**: reverses wallet credits capped at the remaining
     balance (`CREDIT_REFUND` ledger entry), never going negative;
     `creditsReversed` records the actual reversal.
4. Notifies the requester; every step is audited.

## Reconciliation with marketplace/vendor ledgers

Completed refunds reduce platform `CASH_RECEIPT` totals in revenue reports
(net cash receipts). Marketplace refunds that touch vendor earnings remain in
the vendor ledger domain — the billing report subtracts refund postings from
platform cash and reports vendor liabilities separately, so a marketplace
refund cannot be double-counted as both platform revenue reduction and vendor
liability reduction.
