# Refunds & Credit Notes (Phase 18)

## Model

`BillingCreditNote` — `REFUND` (money back) or `CREDIT_ADJUSTMENT` (account
credit). Reuses nothing destructive from the marketplace `RefundRequest`
(Phase 8 flow remains untouched and separate).

## Lifecycle

```
REQUESTED ──(finance approve)──▶ ISSUED ──(payout confirmed)──▶ COMPLETED
    └──(reject)──▶ REJECTED                    └──▶ VOID
```

1. **Request** — customer (or finance) from a `PAID`/`PARTIALLY_PAID` invoice.
   Eligibility: amount ≤ `amountPaidMmk − already approved/refunded`
   (`refundableAmountFor`), reason ≥ 10 chars, idempotent on key.
2. **Review** — finance admin approves or rejects with a note.
   Separation of duties: a reviewer cannot act on their own request.
   Approval only reserves the amount — it does **not** mark money returned.
3. **Complete** — requires `payoutMethod` + `payoutReference` (the actual
   KBZPay/WavePay/bank payout), sets `payoutConfirmedAt` + confirmer, then:
   - posts an append-only `REFUND` ledger entry (`DEBIT`),
   - if the invoice is a fully-refunded subscription → subscription
     `CANCELLED` + entitlements disabled (opt-in via `reverseEntitlement`),
   - if a credit-package invoice → AI credits reversed (never below zero),
   - customer notified with the payout reference.

## Double-refund protection

- Eligibility math subtracts approved/issued/completed credit notes.
- The `REQUESTED → ISSUED → COMPLETED` transitions are claimed via
  conditional `updateMany` (concurrent reviews cannot double-apply).
- Ledger idempotency key `refund:{creditNoteId}` prevents double postings.

## History

Full refund history per invoice/account is visible to the account owner
(`/billing/invoices/[id]`) and to finance (`/admin/billing/refunds`). All
actions are recorded in `BillingAuditLog`.
