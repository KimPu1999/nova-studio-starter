# Plans & Pricing Configuration (Phase 18)

## Model

- `BillingPlan` — one row per tier: `FREE`, `STARTER`, `PRO`, `BUSINESS`,
  `ENTERPRISE` (`tier` is unique). `isActive` controls catalog availability.
- `BillingPlanVersion` — immutable price/limits revision. Exactly one version
  per plan is `ACTIVE` at a time; older versions become `RETIRED`; drafts are
  `DRAFT`. Fields (all integer MMK):

| Field | Meaning |
| --- | --- |
| `monthlyPriceMmk` / `annualPriceMmk` | List price per cycle (0 = free) |
| `includedSeats` | Seats included in the base price |
| `maxSeats` | Hard seat ceiling (`null` = unlimited) |
| `websitesLimit`, `customDomainsLimit` | Hosting entitlements (`null` = unlimited) |
| `storageMb`, `bandwidthMb` | Hosting quotas (`null` = unlimited) |
| `monthlyAiCredits` | AI credits included per period |
| `monthlyApiRequests` | Public API quota (`null` = default platform quota) |
| `features[]` | Feature flags: `aiBuilder`, `hosting`, `customDomain`, `apiAccess`, `prioritySupport`, `auditLog`, `whiteLabel`, `sso` |

## Versioning rules

- Changing prices creates a **new version**; existing subscriptions keep their
  current `planVersionId` until they change plan or renew onto the new version.
- Issued invoices reference their line's `planVersionId` and freeze a JSON
  snapshot — retroactive price edits are impossible.
- `createPlanVersion` retires the previous ACTIVE version in the same
  transaction when `activate: true`.

## Seeded catalog (`npm run billing:seed`, idempotent)

| Plan | Monthly | Annual | Seats (incl/max) | Sites | Domains | Storage | AI credits/mo | API req/mo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FREE | 0 | 0 | 1/1 | 1 | 0 | 500 MB | 100 | 0 |
| STARTER | 15,000 | 150,000 | 2/3 | 2 | 1 | 5 GB | 2,000 | default |
| PRO | 45,000 | 450,000 | 5/10 | 10 | 5 | 25 GB | 10,000 | 50,000 |
| BUSINESS | 120,000 | 1,200,000 | 15/40 | 50 | 20 | 100 GB | 40,000 | 250,000 |
| ENTERPRISE | 350,000 | 3,500,000 | 50/∞ | ∞ | ∞ | ∞ | 150,000 | 1,000,000 |

Prices are configuration data in `prisma/billing-seed.ts`, not hardcoded in
application logic. Edit the seed (or the admin UI at `/admin/billing/plans`)
and re-run to adjust; the admin plan-version form is the operational path.

## AI credit packages

`BillingCreditPackage` (admin-seeded): 1,000 credits / 5,000 MMK;
5,000 + 500 bonus / 25,000 MMK; 20,000 + 4,000 bonus / 90,000 MMK.
Purchase creates an ISSUED invoice; credits land only after verified payment.
