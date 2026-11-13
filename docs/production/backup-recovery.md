# NOVA Studio — Backup & Disaster Recovery

## Targets

| Metric | Target | Rationale |
|---|---|---|
| RPO | ≤ 24 h (daily full + WAL/continuous if provider supports) | Financial ledger must never lose a posted day. |
| RTO | ≤ 4 h | Restore + migrate + verify + repoint. |

## What must be backed up

1. **PostgreSQL** — everything (ledger, invoices, orders, subscriptions, tenants, audit logs). This is the single source of truth.
2. **Private storage dir / bucket** — payment proofs, product ZIPs, source files. Keys are referenced from the DB; losing them breaks proof-of-payment review.
3. **Environment/secret vault** — separately, never inside the database backups.
4. **Deployment artifacts** — rebuildable from git + CI; not backed up.

## Configuration status (honest)

- Local development: no automated backups (not required).
- Production: **NOT CONFIGURED YET** — requires the production database provider. When provisioning, enable daily automated snapshots + PITR/WAL retention ≥ 7 days, and storage bucket versioning + replication for `PRIVATE_STORAGE_DIR` equivalent.
- Retention: ≥ 30 days of dailies, ≥ 12 months of monthlies for financial auditability.
- Encryption: provider-encrypted at rest; restore access limited to named operators.
- Access control: backups must not be downloadable by application credentials.

## Recovery procedure (to be executed and signed off before launch)

```bash
# 1. Provision a NEW isolated restore target (never overwrite production).
createdb nova_studio_restore_test

# 2. Restore latest base backup + WAL replay.
pg_restore --dbname=nova_studio_restore_test --no-owner <dump-file>
# managed provider: restore-to-new-instance via console/CLI

# 3. Restore private storage to a separate directory; point PRIVATE_STORAGE_DIR at it.

# 4. Verify (isolated environment, separate port, separate credentials):
npx prisma migrate status                 # schema current, no drift
npx prisma db execute --stdin <<< "SELECT count(*) FROM \"BillingLedgerEntry\";"
# Spot-check: latest invoice, latest ledger entry, latest payment attempt,
# vendor ledger sum >= 0, subscription entitlements present.

# 5. Boot app on the restored DB with production-like env (test port):
DATABASE_URL=... PRIVATE_STORAGE_DIR=... npx next start -p 3100
# Health: GET :3100/api/health -> ok; login as a test account; open one invoice page.
```

**Restore test result: NOT PERFORMED in this phase** — no production backup exists yet. This gate blocks launch sign-off (see launch-checklist.md G4): a successful isolated restore with recorded timestamps is required before the backup gate may be marked PASS.

## Deployment rollback

- Application-level rollback is git + rebuild based (`rollback.md`); database migrations are forward-only, so rollback of a schema change requires a documented forward-fix, not a downgrade.
