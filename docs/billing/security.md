# Billing Security Controls (Phase 18)

## Roles & least privilege

| Role | Billing access |
| --- | --- |
| `SUPER_ADMIN` | Everything |
| `FINANCE_ADMIN` | Payment verification, refund review/completion, reconciliation, reports, sweep (enforced by `requireFinanceAdmin`) |
| `ADMIN` (platform) | Plan catalog, subscription management, invoice issuance/void (`requireBillingPlatformAdmin`) |
| `EDITOR` / `SUPPORT_AGENT` / `CUSTOMER` | No billing admin access |
| Customer | Only own billing data via `requireUser` + `requireBillingAccountAccess` |

The `FINANCE_ADMIN` role was added to `RoleCode` (additive; seeded via
`npm run billing:seed`).

## Tenant isolation

- Billing accounts: `billingKey` unique (`USER:{id}` / `ORG:{id}`) prevents
  duplicate accounts; organization accounts are only reachable by members
  holding workspace `billing.read` / `billing.manage` permissions (Phase 15
  permission model).
- Customer pages resolve invoices/attempts/credit notes strictly through
  account membership; admin pages run behind role gates. No client-supplied
  IDs are trusted without an ownership check.

## Financial invariants (defense in depth)

1. **No entitlement without verified payment** — activation/grant/plan-change
   happen only inside the approval transaction.
2. **Screenshots ≠ proof** — mandatory reviewer `verificationNote`; proofs
   served only to finance via a no-store route.
3. **Separation of duties** — `assertNotSelfApproval` blocks self-review of
   payments and refunds.
4. **Idempotency everywhere** — submissions, invoices, renewals, grants,
   ledger postings, sweeps all keyed; unique constraints are the backstop.
5. **Concurrent-safety** — conditional `updateMany` claims (payment review,
   invoice payment, refund review/completion) so races cannot double-apply.
6. **Seat race protection** — `assertSeatAvailable` inside the invitation
   transaction.
7. **Reference dedupe** — `@@unique([method, transactionReference])`.
8. **Append-only** — ledger and credit-ledger entries are never mutated.
9. **Overpayment guard** — payments can never exceed invoice outstanding.
10. **Refund guard** — refunds can never exceed paid-minus-refunded.

## Auditing

`BillingAuditLog` records: account changes, invoice issue/void, subscription
create/activate/plan-change/cancel/expire/suspend, payment submit/approve/
reject, credit-note request/review/complete, reconciliation create/resolve/
close, sweep runs. Actions are best-effort writes that never block a
financial transaction (documented trade-off).

## Testing coverage (Phase 18)

`tests/billing.test.ts` (26 tests, all passing) covers: the subscription
state machine (including *no activation without payment* and *no silent
auto-renew*), invoice total computation and rejection of bad money values,
refund-eligibility math, quota guard, UTC periods, MRR normalization, scope
keys, statement CSV parsing/validation, reference normalization, and the
admin line parser. Transaction-race scenarios (concurrent verification,
double-grant) are enforced by DB-level unique constraints + conditional
claims; exercising them requires a test database harness (see Remaining
Issues in the Phase 18 report).

## Known limitations (stated honestly)

- No 2FA-gated finance approval, no IP-allowlisting for finance roles.
- Audit log is best-effort (non-transactional) — acceptable for alerting/
  forensics, not a compliance-grade WORM store.
- Proofs are stored on local disk via `PRIVATE_STORAGE_DIR`; production
  should move to object storage with signed URLs.
- No rate limiting specific to billing endpoints beyond the global API
  pipeline; payment submission is CSRF-checked and idempotent.
