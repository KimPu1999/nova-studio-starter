# NOVA Studio — Financial Ledger

## Model

`BillingLedgerEntry` is the platform financial ledger: append-only, immutable,
UUID-keyed, with a unique `idempotencyKey` per posting. Entry types:

| EntryType | Direction | Meaning |
| --- | --- | --- |
| `CASH_RECEIPT` | CREDIT | Verified cash received (only posted on verification) |
| `DEFERRED_REVENUE` | CREDIT / DEBIT | Deferred revenue set-up for period-based invoices; released at period end |
| `REVENUE_RECOGNIZED` | CREDIT | Revenue recognized (period end) |
| `REVENUE_ADJUSTMENT` | — | Manual corrections (rare, audited) |
| `REFUND` | DEBIT | Confirmed refund payouts |
| `CREDIT_NOTE_ISSUED` | — | Credit note issuance trail |
| `CREDIT_REVERSAL` | DEBIT | Wallet credit reversals |

Every entry carries `sourceType`/`sourceId` (e.g. `BillingPaymentAttempt:{id}`)
plus optional `invoiceId` / `paymentAttemptId` / `creditNoteId` links, so
postings are traceable to the exact financial event.

## Invariants

1. **Append-only.** No code path updates or deletes entries.
2. **Idempotent postings.** `postLedgerEntry()` returns the existing entry for
   a repeated key; a retried transaction cannot post twice.
3. **Unverified ≠ revenue.** `CASH_RECEIPT` is posted only from a verified
   payment approval. Pending/rejected attempts never appear in the ledger.
4. **Cash ≠ recognized revenue.** Receipts and recognition are distinct entry
   types; reports distinguish gross cash from recognized figures.
5. **Ledgers are separated.** Marketplace/vendor money stays in the Phase 12
   vendor ledger (`VendorEarning`, `VendorLedgerEntry`, payout requests). The
   billing ledger records platform money only — vendor liabilities are summed
   from vendor tables and reported separately, never as platform revenue.

## Accounting assumptions (documented, not invented)

- **Cash-basis receipts**: cash is recorded when verified, on the posting date.
- **Deferred revenue**: subscription invoices defer the verified amount at
  payment; `recognizeSubscriptionRevenue(invoiceId)` releases it at period end
  (idempotency keys `recognize:{invoiceId}` / `deferred-release:{invoiceId}`).
  Point-in-time products (credit packages) are recognized immediately.
- **Refunds** reduce cash on the confirmation date.
- **Taxes** are not decomposed (no jurisdiction-specific tax accounts).
- These are simplifications for a manual-payment SaaS in Myanmar; consult an
  accountant before statutory reporting.

## Where postings happen

- Payment approval (`postInvoiceSettlementLedger`): cash receipt (+ deferred
  revenue for subscriptions) — inside the approval transaction.
- Refund completion: REFUND debit — inside the payout confirmation transaction.
- Lifecycle sweep: revenue recognition for paid subscription invoices whose
  period ended.
