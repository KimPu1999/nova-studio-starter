# NOVA Studio — Database

## Schema

- Prisma schema: 195 models, valid (`prisma validate` PASS as of 2026-11-13).
- 17 forward-only migrations; **`prisma migrate status`: Database schema is up to date, no drift** against the local development database.

## Conventions

| Concern | Convention |
|---|---|
| Money | Integer MMK minor-free units; `assertIntMmk` at every boundary. No floats/Decimal for money. |
| Idempotency | DB-unique idempotency keys: `BillingPaymentAttempt`, `BillingInvoice`, `BillingCreditNote`, `AiCreditLedger`, `BillingLedgerEntry`, `VendorPayoutRequest`, `PaymentSubmission`. |
| Uniqueness | Financial dedupe: `@@unique([method, transactionReference])` on `BillingPaymentAttempt`; `@@unique([eventType, sourceType, sourceId])` on `VendorLedgerEntry`; `slotKey @unique` enforces one active subscription per scope. |
| Ledger | `BillingLedgerEntry` / `VendorLedgerEntry` / `AiCreditLedger` are append-only — **no update or delete paths exist anywhere in `src`** (verified by search). |
| Tenant relations | All tenant-scoped tables carry `accountId` / `userId` / `vendorId` / `workspaceId` foreign keys with explicit `onDelete` behavior (mostly `Restrict` on financial parents). |

## Migration strategy

- Forward-only. `prisma migrate dev` locally; `prisma migrate deploy` in staging/production. **Never reset, never destructive.**
- CI applies migrations to an isolated Postgres 16 service database before tests/build.
- Adding a migration checklist: expand-only change (additive columns/tables, backfill in a second migration, then constraint tighten), verified against `migrate diff` for destructive steps.

## Transaction patterns (financial)

1. **Status claim:** guarded `updateMany({ where: { id, status: X } })` + `count !== 1` throw inside `prisma.$transaction` — payments, refunds, invoices, payout requests. Exactly-once transitions.
2. **Overpay guard:** conditional increments (`amountPaidMmk: { lte: total − amount }`) with post-increment revalidation.
3. **Atomic credit reservation:** `updateMany({ where: { balance: { gte: amount } } })` decrement.
4. **Snapshot freezing:** invoice totals recomputed and validated before issue; issued invoices immutable (plan versions, not edits).

## Known race windows (documented, accepted for launch)

- Vendor payout request balance check and workspace seat-limit count check are aggregate-then-write without row locks (READ COMMITTED). Mitigations: completion-time negative-balance verification, low concurrency, admin-supervised flows. Planned remediation: `SELECT … FOR UPDATE` advisory or serializable isolation on those two paths.

## Connection pooling

- `src/lib/prisma.ts` instantiates a single `PrismaClient` per process (standard Next.js singleton pattern). For production with PgBouncer or managed pooling, set `?pgbouncer=true&connection_limit=N` on `DATABASE_URL` and use `DIRECT_URL` for migrations. **Not configured yet — infrastructure-dependent** (see deployment.md).

## Backup compatibility

- All tables use UUID PKs and standard Prisma DDL; `pg_dump`/`pg_restore` and managed snapshots apply without special handling. Restore procedure: `backup-recovery.md`.

## Verified results (2026-11-13)

- `prisma validate` — PASS.
- `prisma migrate status` — up to date, no drift. PASS.
- `npm run build` against migrated schema — PASS (see ci-cd.md).
