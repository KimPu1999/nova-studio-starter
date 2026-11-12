# NOVA Studio Production Runbook

This runbook is a controlled procedure. Production deployment, DNS changes,
service provisioning, and payment-account changes require explicit approval.

## Pre-deployment gate

- Confirm the release commit and review the diff.
- Confirm `npm ci`, `npm run typecheck`, `npm run lint`, `npm test -- --run`,
  `npm run build`, and `npx prisma validate` pass.
- Confirm staging smoke tests pass.
- Confirm `npx prisma migrate status` and the intended migration are reviewed.
- Take and verify a database backup.
- Confirm private object storage is configured and access checks pass.
- Confirm email, monitoring, rate limits, and HTTPS are configured.
- Confirm no critical or high security finding remains open.
- Obtain explicit production-release approval.

## Release sequence

1. Put the release in the approved production environment.
2. Set production secrets without printing them in logs.
3. Run `npm ci` and `npm run db:generate`.
4. Run `npm run validate:env`.
5. Run `npm run db:migrate:deploy` after the backup gate.
6. Build with `npm run build`.
7. Start with `npm start` using the platform's process supervisor.
8. Verify `/api/health`, public templates, customer login, admin login, and a
   non-financial payment-review smoke test.
9. Watch error rate, database health, storage failures, and job failures.

## Rollback

Revert application code only when it remains compatible with the already-applied
database schema. Rolling back application code does not reverse Prisma
migrations. Do not manually reverse a migration in production without a reviewed
forward migration and a verified backup. If data recovery is required, restore
into an isolated database first and obtain approval for the recovery plan.

## Emergency maintenance

Use the hosting platform's access controls or a reviewed maintenance mechanism.
Keep admin authentication available for authorized operators. Do not disable
authorization, expose private files, or edit production data directly to bypass
an incident.

## Current launch blockers

- Private file storage is local filesystem based; serverless production is not
  safe until an object-storage adapter is implemented.
- Automated backups and restore verification are not configured by this repo.
- Staging and external monitoring are not configured by this repo.
- `npm audit --audit-level=high` currently reports unresolved transitive
  vulnerabilities requiring major dependency upgrades.
