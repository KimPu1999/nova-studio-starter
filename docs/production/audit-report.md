# NOVA Studio — Phase 19 Audit Report

Date: 2026-11-13 · Auditor: Phase 19 production-readiness review (automated agents + maintainer verification)

## Method

1. Repository inspection (structure, package.json, tsconfig, next.config, Prisma schema, migrations, CI).
2. Two deep audits by independent review agents: (a) security & multi-tenant isolation, (b) payment & financial integrity — both with file:line references.
3. Baseline verification: `tsc --noEmit` PASS, `eslint .` PASS, `vitest run` 93/93 PASS (pre-fix), `prisma validate` PASS, `prisma migrate status` — database schema up to date, no drift.
4. Remediation of verified findings, followed by re-verification (105/105 tests, typecheck, lint, production build).

## Phase 1–18 module inventory

| # | Module | Routes | API | DB models | AuthZ | Workflows | Errors | Responsive | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Homepage/design system | PASS | n/a | n/a | n/a | n/a | PASS | PASS | visual only | PASS |
| 2 | Marketplace | PASS | n/a | PASS | PASS | PASS | PASS | PASS | partial | PASS |
| 3 | Customer auth/checkout | PASS | n/a | PASS | PASS | PASS | PASS | PASS | partial | PASS |
| 4 | Licensing/downloads | PASS | PASS | PASS | PASS (signed tokens) | PASS | PASS | n/a | partial | PASS |
| 5 | Custom website services | PASS | n/a | PASS | PASS | PASS | PASS | PASS | partial | PASS |
| 6 | CMS/localization | PASS | n/a | PASS | PASS | PASS | PASS | PASS | n/a | PASS |
| 7 | LMS | PASS | n/a | PASS | PASS | PASS | PASS | PASS | n/a | PASS |
| 8 | Customer support | PASS | n/a | PASS | PASS | PASS | PASS | PASS | n/a | PASS |
| 9 | Security foundation | PASS | n/a | PASS | PASS | PASS | PASS | n/a | PASS | PASS |
| 10 | Deployment infrastructure | PASS | PASS (health) | n/a | PASS | PASS | PASS | n/a | PASS | PASS |
| 11 | Analytics/marketing | PASS | PASS | PASS | PASS (see F9) | PASS | PASS | PASS | n/a | PASS (with note) |
| 12 | Multi-vendor marketplace | PASS | n/a | PASS | PASS | **FIXED (was FAIL: commissions dead)** | PASS | PASS | n/a | PASS after fixes |
| 13 | AI website builder | PASS | n/a | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 14 | Publishing/hosting | PASS | n/a | PASS | PASS | PASS | PASS | PASS | partial | PASS |
| 15 | Enterprise workspaces | PASS | PASS | PASS | PASS | PASS (see F10) | PASS | PASS | PASS | PASS |
| 16 | Enterprise security | PASS | n/a | PASS | PASS | **PARTIAL (MFA)** | PASS | PASS | PASS | PARTIAL — see risks |
| 17 | Public API/webhooks | PASS | PASS | PASS | PASS | PASS | PASS | n/a | PASS | PASS |
| 18 | SaaS billing | PASS | n/a | PASS | PASS | **FIXED (partial-payment grant, refund cap)** | PASS | PASS | PASS | PASS after fixes |

## Findings (post-remediation status)

### CRITICAL
None found.

### HIGH (fixed in this phase)
| ID | Finding | Fix |
|---|---|---|
| H1 | **Entitlement on partial payment.** Approving any verified amount ≥ 1 MMK activated a full subscription period / full credit package (`payments.ts`). | Entitlements now granted only when the invoice is fully settled; partial verified payments only pay down balance + post ledger. Completion later grants exactly once (idempotency key per invoice). |
| H2 | **Refund over-refund race.** Credit-note review/completion never re-validated cumulative refunds against `amountPaidMmk`. | Cap re-validated inside the claim transaction at both review (reserving) and completion (`refunds.ts`, `committedRefundedTotal`). |
| H3 | **Vendor earnings/commissions never recorded** — `createVendorEarnings` existed but had zero call sites; vendor balances always 0; payouts always impossible. | Marketplace approval now records earnings + commission ledger entries inside the approval transaction (`admin/actions.ts`). |
| H4 | **Vendor payout lifecycle incomplete** — no path out of REQUESTED; reservations never released; reports expected PAID. | Added admin approve/reject/complete + vendor cancel; reservations released on reject/cancel; completion records `VendorPayoutTransaction` + `PAYOUT_COMPLETION` marker; new `admin/vendors/payouts` UI + nav. |
| H5 | **Legacy refund flow granted no reversals** — COMPLETED refunds left orders PAID, entitlements valid, vendor earnings un-reversed, duplicate requests possible. | COMPLETED now flips order to REFUNDED, revokes entitlements, posts vendor `REFUND_REVERSAL` entries; request creation subtracts open/prior refunds; separation-of-duties check added. |
| H6 | **No route middleware** — protection relied entirely on per-file auth calls. | Added `src/middleware.ts` cookie-presence guard (defense-in-depth; real auth unchanged). |

### HIGH (unresolved — documented, not fabricated)
| ID | Finding | Status |
|---|---|---|
| U1 | **MFA never enforced.** `SecurityPolicy.requireMfa` and TOTP pages exist, but login never challenges, and no TOTP credential is ever verified. Admin UI claim "enforced server-side" is inaccurate. | BLOCKED on implementation (TOTP enrollment + login challenge + workspace enforcement). Not weakened, but not functional. |

### MEDIUM (fixed)
| ID | Finding | Fix |
|---|---|---|
| M1 | Legacy payment reviews lacked finance-role separation and self-approval guards. | Marketplace + project-invoice reviews now require `SUPER_ADMIN|FINANCE_ADMIN` and block self-review. |
| M2 | OAuth deny path redirected to unvalidated `redirect_uri` (open redirect). | All consent redirects validated against the client's registered URIs (`redirectUriAllowed`). |
| M3 | Reconciliation lacks accounting-equation verification. | Documented as accepted gap for launch (see risks); duplicate/missing-posting checks remain active. |
| M4 | Billing sweep had no scheduler entry point despite documented token. | `POST/GET /api/cron/billing-sweep` guarded by `BILLING_JOBS_TOKEN` (503 unconfigured, 401 unauthorized). Env validation + `.env.example` updated. |
| M5 | `cancelPaymentAttempt` used unguarded `update` (could overwrite an approving reviewer). | Converted to guarded `updateMany` claim. |
| M6 | Analytics ingestion unthrottled. | Durable per-IP 120/hour rate limit (best-effort; IP from `x-forwarded-for`). |
| M7 | No HSTS header. | Added `Strict-Transport-Security: max-age=63072000; includeSubDomains`. |
| M8 | Vendor ledger funds: refund of admin-set REFUNDED order posted no vendor reversal. | Added idempotent `REFUND_REVERSAL` postings. |

### MEDIUM (unresolved / accepted risk)
| ID | Finding | Rationale |
|---|---|---|
| U2 | Workspace `sessionDurationHours` / `invitationExpiryDays` policy values stored but not enforced (login hardcodes 8 h; invitations 7 days). | Enforcement requires session-row policy capture; scheduled for Phase 20. Values are displayed as "configurable" — UI copy should not claim enforcement. |
| U3 | Concurrency limiter for `/api/v1` is per-instance in-memory. | Documented in code; durable rate limiting (the financial control) is Postgres-backed. Multi-instance deploys must front with a gateway limit. |
| U4 | Vendor payout request balance check is not row-locked (READ COMMITTED race). | Mitigations: completion-time negative-balance guard, ledger is per-vendor, and no self-payout (admin completes transfers). Serialization advisory planned. |
| U5 | Seat-limit count check is not lock-protected (concurrent invitations can exceed `seats.max`). | Accepted for launch; monitoring on seat counts. |
| U6 | No Content-Security-Policy header. | Requires careful rollout (inline styles in current UI); recommend report-only CSP in Phase 20. |

### LOW (fixed)
- Duplicate `billing:seed` script in package.json — removed.
- Admin nav duplicated "Billing" link — now links to Subscriptions.
- Rejected payment reference retry raised unhandled P2002 — now a clear user error.
- Empty error strings in refund actions — replaced with meaningful messages.
- `admin/vendors` section had no nav entries — added Vendor applications + Vendor payouts.

### LOW (unresolved)
- Payment-proof download route serves any private key for finance admins without verifying association with a specific submission (insider-only, unguessable keys).
- Password reset token is never delivered in production (no mailer). Reset flow is dev-only until an email provider is configured.
- Login throttle keyed by email only (no per-IP dimension).
- Partially-paid overdue invoices stay `PARTIALLY_PAID` instead of `OVERDUE` (payable status either way; lifecycle unaffected).
- Client-secret comparison not constant-time (SHA-256 digests; practical risk negligible).

## Verified good (unchanged)

- Exactly-once Phase 18 payment approval (guarded status claim + single transaction).
- Append-only, idempotency-keyed ledger entries; zero update/delete paths on financial tables.
- Integer-MMK money arithmetic with `assertIntMmk` at every boundary.
- Atomic credit reservation (`balance >= amount` conditional decrement), non-negative refund reversals.
- Tenant scoping via `findFirst` with ownership predicates across all sampled surfaces; zero unscoped `findUnique({where:{id}})` in app code.
- PKCE-S256 mandatory OAuth, exact-match redirect URIs, single-use codes with replay revocation, refresh-token rotation.
- SSRF-hardened webhook fetch (private-IP/metadata blocking, per-hop revalidation, response caps).
- Path-traversal-safe private storage; zero `dangerouslySetInnerHTML`; AI output Zod-validated with URL protocol refinements.
- Zero secrets logged (no `console.*` in `src`).
- Durable Postgres rate limits and monthly quotas on `/api/v1`.

## Verdict

**No launch blocker remains from this audit** with the exceptions gated in `launch-checklist.md`: MFA enforcement (U1) must be either implemented or formally risk-accepted by the product owner before public launch, and the unresolved MEDIUM items require sign-off in the risk register.
