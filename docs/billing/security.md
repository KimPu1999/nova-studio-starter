# NOVA Studio — Billing Security Controls

## Authorization model

| Role | Capabilities |
| --- | --- |
| `SUPER_ADMIN` | Everything (full finance + platform) |
| `FINANCE_ADMIN` | Payment verification, refund review/completion, reconciliation, ledger, reports, billing sweep |
| `ADMIN` (platform) | Plan catalog, subscription admin actions, invoice issue/void; read access to billing pages |
| Customer | Own/organization billing pages only, via billing-account ownership |

Enforcement is server-side in `src/lib/billing/rbac.ts`:

- `requireBillingViewer()` — least-privilege read for billing pages.
- `requireBillingPlatformAdmin()` — catalog/subscription/invoice mutations.
- `requireFinanceAdmin()` — all money-moving decisions.
- `assertNotSelfApproval()` — separation of duties on payment reviews, refund
  reviews, and refund payouts.

`requireAdmin()` (Phase 16 security layer) gates every admin page; all server
actions run `csrfCheck()` (origin validation) first.

## Tenant isolation

- `requireBillingAccountAccess(accountId, user)`: personal accounts are
  accessible only by their owner; organization accounts only by members of the
  owning organization's workspaces holding `billing.read`/`billing.manage`
  (Phase 15 permission matrix). Every customer billing page, payment
  submission, settings update, and refund request funnels through it.
- Duplicate-active billing accounts are impossible (`billingKey` unique:
  `USER:{id}` / `ORG:{id}`), so tenant keys cannot be spoofed by creating a
  parallel account.
- Invoice/subscription/payment/ledger queries are always scoped by
  `accountId` resolved through the access check — never by client-supplied IDs
  alone.

## Financial integrity controls

- Integer-MMK invariant asserted at every entry point (`assertIntMmk`).
- Unique idempotency constraints on invoices, payment attempts, ledger
  postings, credit grants, usage events, subscriptions (scope slot) — verified
  by `tests/billing-integration.test.ts` against the real database.
- Payment-reference uniqueness per method prevents one wallet transaction from
  paying two invoices.
- Invoice immutability after issue; ledger append-only; audit log append-only.
- Entitlements derived only from verified subscription state; 60s in-process
  cache invalidated on every sync (no stale escalation).
- Payment proofs are private files, readable only via the finance-only proof
  route (`SUPER_ADMIN`/`FINANCE_ADMIN`).

## Test coverage (see tests/)

- `tests/billing.test.ts` — 25 unit tests: totals math, transitions, refund
  eligibility, reference normalization, statement parsing, quotas, separation
  of duties, payable statuses, period math.
- `tests/billing-integration.test.ts` — 4 database tests (rollback
  transactions): duplicate payment reference rejection, duplicate ledger key
  rejection + payment application/overpayment guards, idempotent usage
  ingestion, transactional seat-limit enforcement.
- Existing suites (`api-v1`, `workspaces`, `security`, `webhooks`, …)
  confirm marketplace/AI/hosting/LMS/developer surfaces remain functional.

## Production limitations

- No PSP/webhook integration: verification is human, with audit + separation
  of duties; the fraud surface is the finance queue, mitigated by mandatory
  verification notes and reconciliation.
- Session-based auth uses the existing Phase 16 security stack; billing adds no
  new credential types.
- Entitlement cache is per-process (single-instance friendly). For multi-region
  deployments, replace with a shared store + the same invalidation hooks.
