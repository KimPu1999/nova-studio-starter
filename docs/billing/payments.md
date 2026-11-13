# NOVA Studio — Manual Payment Verification (KBZPay / WavePay / Bank)

## Non-negotiable rules

1. **Screenshots are never proof.** Uploaded receipts (`proofStorageKey`) are
   private records for the reviewer. Approval requires the reviewer to confirm
   the transfer in the ACTUAL wallet/bank transaction history and to record a
   verification note.
2. **No entitlements before verification.** Activation, renewal, plan changes
   and credit grants happen exclusively inside the approval transaction.
3. **Duplicate references are impossible.** `@@unique([method,
   transactionReference])` on `BillingPaymentAttempt`; references are
   normalized (whitespace stripped, uppercased) before insert, so the same
   wallet transaction can never pay two invoices.
4. **Separation of duties.** `assertNotSelfApproval()` blocks a user from
   reviewing their own submission — enforced on payment attempts, refund
   reviews and refund payouts.
5. **Every decision is audited.** SUBMIT / APPROVE / REJECT / CANCEL write
   `BillingAuditLog`, and the submitter is notified.

## Workflow

1. **Customer selects invoice** (`/billing/invoices/[id]`).
2. **Customer submits**: method (KBZPAY / WAVEPAY / BANK_TRANSFER), integer-MMK
   amount ≤ outstanding, transaction reference (≥ 4 chars), receipt file
   (PNG/JPEG/PDF ≤ 8 MB) → `submitPaymentAttempt()`.
   - Idempotency key is a hash of invoice+user+amount+reference, so retried or
     double-clicked submissions collapse to one attempt.
   - Proofs are stored via `putPrivateFile()` (private storage, never public).
3. **Attempt enters `PENDING_REVIEW`** and appears in the finance queue
   (`/admin/billing/payments`).
4. **Finance reviewer** opens the proof (finance-only route), checks the
   reference + amount against the wallet/bank statement.
5. **Decision** (`reviewPaymentAttempt()`):
   - `REJECTED`: requires a reason; attempt → `REJECTED`; invoice untouched.
   - `APPROVED`: requires a verification note. In ONE transaction:
     1. Conditional claim of the attempt (`PENDING_REVIEW → APPROVED`) — two
        concurrent reviewers cannot both proceed.
     2. `applyInvoicePayment` on the invoice (overpayment-guarded).
     3. Ledger postings (cash receipt; deferred revenue for subscription
        invoices).
     4. Entitlement grant, exactly once: subscription activation/renewal,
        plan-change application, or AI-credit grant (`billing:credits:{invoiceId}`
        idempotency).
     Any failure rolls the entire transition back; retrying is safe.
6. **Customer notified** with the outcome; the invoice/subscription pages
   reflect verified state immediately.

## Cancelling an attempt

The submitter (or finance) can cancel a still-`PENDING_REVIEW` attempt.

## Security notes

- Proof files are served only through `/admin/billing/payments/proof` to
  SUPER_ADMIN / FINANCE_ADMIN (no tenant, no customer, no other roles).
- Review endpoints require `FINANCE_ADMIN` (or SUPER_ADMIN) server-side.
- Unverified payments are never posted to the ledger and never counted as
  revenue (see reports/reconciliation).
