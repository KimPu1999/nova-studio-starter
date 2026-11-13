# Invoices (Phase 18)

## Model

`BillingInvoice` + `BillingInvoiceLine`.

- Statuses: `DRAFT → ISSUED → (PARTIALLY_PAID) → PAID`, plus `OVERDUE`
  (auto-marked after `dueAt` with zero payments) and `VOID`.
- `purpose`: `SUBSCRIPTION`, `PLAN_CHANGE`, `CREDIT_PACKAGE`, `HOSTING`,
  `API_USAGE`, `ADJUSTMENT`.
- Money fields (integer MMK): `subtotalMmk`, `discountMmk`, `taxMmk`,
  `totalMmk`, `amountPaidMmk`. `totalMmk = subtotalMmk − discountMmk + taxMmk`.
- Invoice numbers: `{prefix}-YYYYMM-XXXXXXX` (e.g. `NV-202611-8F3KQ2A`),
  unique via DB constraint with collision-retry tokens.

## Workflow

1. `createInvoice(...)` — builds a DRAFT with validated lines
   (`computeInvoiceTotals` recomputes everything from lines; negative totals
   and non-integer amounts are rejected). Idempotent on `idempotencyKey`.
2. `issueInvoice(id)` — `DRAFT → ISSUED`. Re-validates totals against stored
   lines, then **freezes an immutable snapshot** (lines + totals JSON).
3. Payments: `applyInvoicePayment(tx, invoiceId, amountMmk)` — conditional
   update guarding overpayment and concurrent application; sets
   `PARTIALLY_PAID`/`PAID` and `paidAt`.
4. `markOverdueInvoices()` — job helper for ISSUED invoices past due.
5. `voidInvoice(id)` — allowed only for unpaid DRAFT/ISSUED/OVERDUE invoices;
   paid invoices must be refunded via credit notes instead.

## Immutability

`assertInvoiceMutable` blocks any line/total mutation after issuance. The
auditable path for corrections is a credit note (`docs/billing/refunds.md`) or
an adjustment invoice — never an edit.

## Access

- Customers: `/billing/invoices` and `/billing/invoices/[id]` — only invoices
  of billing accounts they own (or hold organization billing access on).
- Admins: `/admin/billing/invoices` (viewer read; issuance/void requires
  platform admin). Invoice detail shows ledger postings for the invoice.
- Downloadable/printable view: the invoice detail page is print-styled via the
  browser; a PDF renderer is intentionally not claimed as tax-compliant.

## Tax

`taxMmk` is a configuration input per invoice. **No jurisdictional tax
compliance is claimed** — consult a Myanmar tax adviser before enabling tax
lines in production.
