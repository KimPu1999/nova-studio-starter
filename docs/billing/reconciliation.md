# Financial Reconciliation & Revenue Reporting (Phase 18)

## Financial ledger recap

`BillingLedgerEntry` is append-only; postings are idempotent
(`idempotencyKey` unique). `CASH_RECEIPT` (CREDIT) is posted only inside a
verified payment approval; subscription invoices additionally post
`DEFERRED_REVENUE` (CREDIT), releasable to `REVENUE_RECOGNIZED`;
`REFUND` (DEBIT) posts only when a payout is confirmed.

Accounting assumptions (documented, not hidden):

- Management-reporting ledger, not a double-entry GL. No journals, contra
  accounts, or fiscal close. No tax compliance is claimed.
- Vendor commissions stay in the Phase 12 vendor ledger and are reported as
  **liabilities**, never as platform revenue.
- Marketplace (Phases 4–5) and LMS (Phase 7) money still lives in their own
  flows and is **excluded** from Phase 18 billing reports; the reports UI
  states this limitation.

## Revenue reporting (`/admin/billing/reports`)

`buildRevenueReport(from, to)` over `[from, to)` UTC:

| Metric | Method |
| --- | --- |
| Verified cash receipts | Σ `CASH_RECEIPT` (CREDIT) in window |
| Refunds | Σ `REFUND`/`CREDIT_*` (DEBIT) in window |
| Net receipts | receipts − refunds |
| Revenue by category | cash receipts grouped by invoice purpose (`SUBSCRIPTION`, `CREDIT_PACKAGE`, `PLAN_CHANGE`, …) |
| Active subscriptions / MRR | count + Σ `monthlyNormalizedMmk(priceMmk, cycle)` (annual ÷ 12) over `ACTIVE` subs at query time; `ARR = MRR × 12` |
| Outstanding | Σ (`totalMmk − amountPaidMmk`) over `ISSUED`/`PARTIALLY_PAID`/`OVERDUE` |
| Vendor liabilities | Σ vendor `netMmk` earned-and-available − Σ paid-out payouts (from Phase 12 tables, kept OUT of platform revenue) |

Unverified payments are excluded by construction (they never reach the
ledger). All timestamps UTC; the UI notes Asia/Yangon display conversion.

## Reconciliation (`/admin/billing/reconciliation`)

1. **Create a run** — pick a UTC period; optionally paste a statement CSV
   (`reference,amount,date` per line; `#` comments). The raw statement is
   stored privately and validated with Zod; **no bank confirmations are
   fabricated** — only what a finance user imports is analyzed.
2. Deterministic matching:
   - Approved payment attempts ↔ statement rows by (reference, amount);
   - Duplicate detection: the same reference used more than once (attempt or
     statement) → `INVESTIGATING` with `DUPLICATE_REFERENCE`;
   - Verified payments with no statement row → `UNMATCHED` (cash possibly
     received without a submission, or the statement is incomplete);
   - Statement rows with no verified payment → `UNMATCHED`;
   - Approved attempts missing ledger postings → `INVESTIGATING`
     (data-integrity check).
3. **Human resolution only.** Items move `UNMATCHED → MATCHED / INVESTIGATING
   / RESOLVED` via explicit finance actions; **nothing is ever
   auto-approved**. Closing a run with unresolved items is allowed but the
   count is recorded in the closure note.
4. Every run, item resolution, and closure is audited
   (`BillingAuditLog`) with the acting finance user.

## Procedure (monthly close, recommended)

1. Export the wallet/bank statement for the UTC month.
2. Import it into a new reconciliation run.
3. Resolve `UNMATCHED`/`INVESTIGATING` items (refund double-pays, chase
   missing submissions, fix statement errors).
4. Cross-check `/admin/billing/reports` (receipts vs refunds vs outstanding).
5. Close the run; review `/admin/billing/audit` for the month's actions.
