# NOVA Studio — Financial Reconciliation

## Purpose

Reconciliation compares a (optionally imported) bank/wallet statement period
against verified payment attempts and ledger postings, so finance can prove
that every recorded payment is backed by real money — and that real money has
a matching record.

## What a run does (`createReconciliationRun()`)

For all `APPROVED` payment attempts reviewed inside `[periodStart, periodEnd)`:

1. **Payment matching** — attempts are matched to imported statement rows by
   normalized reference + exact integer-MMK amount (one statement row is
   consumed once).
2. **Duplicate reference detection** — the same reference used by more than one
   attempt (or appearing twice in a statement) is flagged
   `INVESTIGATING / DUPLICATE_REFERENCE`.
3. **Missing statement rows** — verified payments with no matching statement
   row are `UNMATCHED` (money may not have actually arrived).
4. **Missing ledger postings** — verified payments without a corresponding
   `BillingLedgerEntry` are `INVESTIGATING` (data-integrity issue).
5. **Orphan statement rows** — statement money with no verified submission is
   `UNMATCHED` (never auto-matched to an invoice).

## Hard rules

- **Nothing is auto-approved.** Unmatched items remain `UNMATCHED` until a
  finance user sets `MATCHED` / `INVESTIGATING` / `RESOLVED` — a human decision,
  recorded with reviewer + timestamp.
- **No fabricated bank confirmations.** Statement data comes only from the
  finance-imported CSV or manual review.
- **Statements stay private.** CSVs are stored via private storage; only
  references/amounts/dates are parsed and stored on items.
- **Validated imports.** `parseStatementCsv` (Zod) accepts
  `reference,amount[,date]` rows, rejects malformed lines, comments (`#`),
  non-integer/non-positive amounts.
- **Immutable history.** Reports are never deleted; closing records who closed
  and how many items were unresolved.

## Procedure (finance)

1. Export the KBZPay/WavePay/bank statement for the period.
2. `/admin/billing/reconciliation` → create a run with the UTC period, optional
   statement name/CSV/total.
3. Review items: verify `UNMATCHED` payments against the wallet/bank; resolve
   or investigate each one.
4. Close the run with notes when the period is clean.

Run summaries (matched/unmatched counts + amounts) are surfaced on the page;
unresolved items block a clean close and are visible in the run header.

## Relation to reports

Unmatched verified payments remain counted as cash in reports (they were
verified) but are flagged here for follow-up; pending (unverified) submissions
are excluded from both. Closing a run never mutates invoices or ledger entries.
