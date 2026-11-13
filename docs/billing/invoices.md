# NOVA Studio — Invoices

## Model

`BillingInvoice` (+ `BillingInvoiceLine`) with statuses
`DRAFT → ISSUED → PARTIALLY_PAID → PAID`, plus `OVERDUE` and `VOID`.

- **Numbers**: `NV-YYYYMM-XXXXXX` (account `invoicePrefix`, UTC month, token
  derived from the idempotency key + a random digit), unique in the DB.
- **Money**: all amounts (`subtotalMmk`, `discountMmk`, `taxMmk`, `totalMmk`,
  `amountPaidMmk`, line `unitAmountMmk/amountMmk`) are integer MMK.
- **Totals**: always recomputed from lines (`computeInvoiceTotals`), validated
  again at issue time (`subtotal == Σ lines` and `total == subtotal − discount
  + tax`), so totals can never drift from the lines.
- **Purposes**: `SUBSCRIPTION`, `PLAN_CHANGE`, `CREDIT_PACKAGE`, `HOSTING`,
  `API_USAGE`, `ADJUSTMENT`, `OTHER` (free-form string validated at creation).

## Immutable issued snapshots

`issueInvoice()` (DRAFT → ISSUED) freezes a `snapshot` JSON of the totals and
lines. After issuing, `assertInvoiceMutable()` rejects any line/total edits —
issued invoices are never silently modified. Corrections are handled by:

- **Void** — only for unpaid invoices (`amountPaidMmk === 0`).
- **Credit notes** — for paid/partially paid invoices (see refunds.md).
- **Adjustment invoices** — new `ADJUSTMENT`-purpose invoices.

## Payment application

`applyInvoicePayment(tx, invoiceId, amountMmk)` runs inside the verifier's
approval transaction and is safe under concurrency:

- Validates the status is payable (`ISSUED | PARTIALLY_PAID | OVERDUE`).
- Rejects amounts exceeding the outstanding balance.
- Applies the increment with a conditional `updateMany` on the previous
  `amountPaidMmk`, so two concurrent approvals cannot both succeed against
  stale state; one fails and the transaction rolls back.
- Sets `PARTIALLY_PAID` / `PAID` accordingly and stamps `paidAt` on full
  settlement.

## Access control

Customers access invoices only through `requireBillingAccountAccess()` —
personal invoices for the owner, organization invoices for members holding
`billing.read`/`billing.manage` on the owning workspace. Admin views require
billing viewer roles. Downloadable invoices: the customer invoice page renders
the full line-item view and the issued snapshot (print/export via browser); a
PDF renderer is not wired in this phase (see limitations).

## Tax

`taxMmk` is an explicit per-invoice amount configured by the issuer. The
platform does **not** claim VAT/tax compliance for any jurisdiction — confirm
requirements with an accountant before issuing tax-bearing invoices.
