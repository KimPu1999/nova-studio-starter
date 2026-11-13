# Manual Payment Verification (Phase 18)

Supported methods: **KBZPay**, **WavePay**, **Bank Transfer** (configured
per `PaymentMethod` rows where applicable).

## Rules (non-negotiable)

1. Screenshots/proofs are **review material, not proof of payment**. Approval
   requires the finance reviewer to confirm the actual transfer in wallet/bank
   transaction history; the confirmation is recorded as a mandatory
   `verificationNote`.
2. **Transaction references are globally unique per method**
   (`@@unique([method, transactionReference])`) — the same KBZPay/WavePay
   reference cannot pay two invoices.
3. **Separation of duties**: `assertNotSelfApproval` hard-blocks a reviewer
   from approving their own submission. Finance decisions require the
   `FINANCE_ADMIN` role (or `SUPER_ADMIN`).
4. Proofs are stored via `private-storage` and served only through
   `/admin/billing/payments/proof?key=…`, restricted to `SUPER_ADMIN` /
   `FINANCE_ADMIN` with `no-store` caching. Customers never see proofs.
5. Entitlements (subscription activation, credit grants, plan changes) are
   granted **only inside the verified-approval transaction**, once.

## Workflow

```
Customer (billing UI)                 Finance admin (/admin/billing/payments)
─────────────────────                 ───────────────────────────────────────
1. Select invoice (outstanding > 0)
2. Submit payment attempt:
   amount ≤ outstanding, method,
   transaction reference, optional
   proof (PNG/JPEG/PDF ≤ 8 MB)
   → status PENDING_REVIEW
   (idempotent submission)
                                      3. Review queue (paginated, oldest first)
                                      4. Verify the transfer in the actual
                                         KBZPay/WavePay/bank statement
                                      5a. APPROVE  — verificationNote required
                                          → ONE transaction:
                                            claim → apply to invoice →
                                            ledger (CASH_RECEIPT [+ DEFERRED])
                                            → activate/renew subscription /
                                              grant credits / apply plan change
                                      5b. REJECT — reason required
                                          → claim only; nothing is applied
6. Customer sees PENDING_REVIEW
   honestly ("screenshots are not
   confirmation"), then VERIFIED or
   REJECTED with reason
```

## States

`PENDING_REVIEW → APPROVED | REJECTED | CANCELLED` (submitter or finance may
cancel a still-pending attempt).

## Partial payments

Multiple verified attempts can settle one invoice (`PARTIALLY_PAID` until the
sum reaches `totalMmk`). Each attempt posts its own idempotent ledger entry.

## Reconciliation link

Approved attempts without a matching bank statement row, duplicate references,
and approved attempts missing ledger postings are surfaced by
`/admin/billing/reconciliation` (see `docs/billing/reconciliation.md`).
Nothing is auto-approved there either.
