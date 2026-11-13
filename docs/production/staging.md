# NOVA Studio — Staging Environment

## Purpose

Isolated, production-shaped environment for migration checks, E2E smoke tests, and safe rehearsal of payment verification — with **zero access to production financial systems**.

## Isolation contract

| Resource | Requirement |
|---|---|
| Database | Separate PostgreSQL instance/DB (e.g. `nova_studio_staging`). Never a branch of production data with live credentials. |
| Storage | Separate `PRIVATE_STORAGE_DIR` (or staging bucket) — payment proofs and product ZIPs never shared with production. |
| Credentials | Separate `SESSION_SECRET` (≥ 32 chars), separate admin bootstrap (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), separate `BILLING_JOBS_TOKEN`. |
| AI keys | Staging-only provider keys with hard monthly spend caps; `AI_ENABLED` may remain `false`. |
| Webhook endpoints | Staging receivers registered separately; production webhook secrets never reused. |
| Money | **All payments in staging are synthetic.** Reviewers verify against fake wallet exports only. No real KBZPay/WavePay accounts. |

## Setup

1. Provision the staging database and set `DATABASE_URL` (and `DIRECT_URL` if pooling) in the staging environment only.
2. `npx prisma migrate deploy` — forward-only, same migrations as production will receive.
3. Seed: `npm run db:seed` + `npm run billing:seed` (synthetic plans/catalog), then `npm run admin:create` with staging credentials.
4. Configure staging `.env` via the production checklist in `deployment.md` minus real payment rails.
5. Schedule the billing sweep: `POST /api/cron/billing-sweep` with `Authorization: Bearer $BILLING_JOBS_TOKEN` (e.g. hourly cron).

## Teardown

- Drop the staging database (`DROP DATABASE nova_studio_staging;`) and clear the staging storage directory. Nothing in staging is ever synced back to production.

## Data policy

- Synthetic data only (seeds + manually created test accounts). If production-derived data is ever needed for debugging, it must be manually inspected, anonymized, and approved first — never bulk-copied.

## E2E smoke list (execute on every staging deploy)

1. Health: `GET /api/health` returns `{status:'ok'}`.
2. Auth: register → login → MFA note (MFA enrollment is not enforced; see security-review.md) → logout.
3. Marketplace: browse templates → add to cart → checkout → submit payment with synthetic proof → admin verifies with matching amount → license + download token works.
4. SaaS billing: select plan → invoice issued → payment attempt → finance approval → entitlement active; partial-payment attempt grants no entitlement until fully paid.
5. AI builder: create project (only if `AI_ENABLED` with staging keys) → credits reserved → generated → credits settled; failure path releases reservation.
6. Hosting: publish site → subdomain renders → rollback to previous deployment.
7. Vendor: create product → admin approves order → vendor earning appears → payout request → admin approve → complete → ledger reflects release/completion.
8. Workspaces: invite member → role permissions respected → API key scoped to workspace works on `/api/v1`.
9. Cron: billing sweep endpoint 401s without token, 200 with token.
10. Monitoring: structured logs show request IDs; error surfaced in the error tracker (when configured).

**Status: NOT RUN end-to-end in this phase** — staging infrastructure is not yet provisioned. The checklist above is the gate for the staging verification sign-off.
