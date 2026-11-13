# NOVA Studio — Plan Configuration

## Model

- `BillingPlan`: the sellable plan (code FREE/STARTER/PRO/BUSINESS/ENTERPRISE,
  tier, name, description, sort order, availability flag `isActive`).
- `BillingPlanVersion`: immutable, versioned pricing + limits. Exactly one
  `ACTIVE` version per plan at a time; earlier versions become `RETIRED`.

Prices are **integer MMK**. `monthlyPriceMmk` and `annualPriceMmk` are stored
per version, so:

- Historical invoices keep the price/limits of the version that was active when
  they were issued (`BillingInvoiceLine.planVersionId`).
- Existing subscriptions keep their current version until a plan change or
  renewal; renewals re-read the subscription's version, not the catalog.
- Changing prices never retro-modifies invoices (enforced by immutability of
  issued invoices and by version pinning).

## Limits carried per version

| Field | Meaning | `null` semantics |
| --- | --- | --- |
| `includedSeats` | Seats included in the base price | ≥ 1 |
| `maxSeats` | Hard seat ceiling (invites fail at the limit) | unlimited |
| `websitesLimit` | Hosted websites allowed | unlimited |
| `customDomainsLimit` | Custom domains allowed | unlimited |
| `storageMb` / `bandwidthMb` | Hosting quotas (MB, monthly) | unlimited |
| `monthlyAiCredits` | AI credits granted per month | 0 = none |
| `monthlyApiRequests` | Public API requests per month | unlimited |
| `features` | Feature flags (aiBuilder, hosting, customDomain, apiAccess, prioritySupport, auditLog, whiteLabel, sso) | — |

## Seeded catalog (`prisma/billing-seed.ts`, idempotent)

| Plan | Monthly | Annual | Seats (incl→max) | Websites | Domains | Storage | AI credits/mo | API req/mo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FREE | 0 | 0 | 1→1 | 1 | 0 | 500 MB | 100 | 0 |
| STARTER | 15,000 | 150,000 | 2→3 | 2 | 1 | 5,000 MB | 2,000 | — |
| PRO | 45,000 | 450,000 | 5→10 | 10 | 5 | 25,000 MB | 10,000 | 50,000 |
| BUSINESS | 120,000 | 1,200,000 | 15→40 | 50 | 20 | 100,000 MB | 40,000 | 250,000 |
| ENTERPRISE | 350,000 | 3,500,000 | 50→∞ | ∞ | ∞ | ∞ | 150,000 | 1,000,000 |

These are seed defaults, not hardcoded business rules — all runtime decisions
read `BillingPlanVersion` rows, and admins publish new versions from
`/admin/billing/plans` without deploys.

## Creating a new version

`createPlanVersion()` (admin action `createPlanVersionAction`):

1. Validates integer MMK prices and seat minimums.
2. If `activate`, atomically retires the current `ACTIVE` version first
   (exactly one ACTIVE version per plan).
3. Creates the new version (`DRAFT` unless activating).

Plan changes (`resolvePlanChange`) require the target plan to be active with an
ACTIVE version; the prorated delta is charged through a `PLAN_CHANGE` invoice
that is applied **only after payment verification**. Downgrades issue no
automatic refund — the difference is handled as a credit note request.
