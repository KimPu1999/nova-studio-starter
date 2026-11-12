# NOVA Studio PostgreSQL Deployment

## Current database contract

The application uses Prisma 6 and reads `DATABASE_URL`. The repository currently
does not configure a separate Prisma migration URL or connection adapter. Use a
managed PostgreSQL connection with TLS enabled by the provider; if the provider
requires it, include `sslmode=require` in the connection URL.

Use separate databases for development, staging, and production. Never point a
local `.env` at production and never run reset commands against production.

## Approved migration sequence

From a reviewed release commit:

```sh
npm ci
npm run db:generate
npm run db:migrate:deploy
```

`prisma migrate deploy` is the production migration command. Do not use
`prisma db push` or `prisma migrate reset` as deployment procedures. Review the
generated migration and take a verified backup before applying it.

Check migration state with:

```sh
npx prisma migrate status
```

## Backup and restore procedure

The repository does not currently configure automated backups. The selected
database provider must provide encrypted automated backups and point-in-time
recovery before launch. As a provider-neutral manual procedure:

```sh
pg_dump --format=custom --file=nova-studio-$(date +%Y%m%d-%H%M).dump "$DATABASE_URL"
pg_restore --clean --if-exists --dbname="$RESTORE_DATABASE_URL" nova-studio-YYYYMMDD-HHMM.dump
```

Restore only into an isolated database during a recovery test. Verify table
counts, migration state, admin login, published marketplace pages, and private
file references before considering the restore valid.

Recommended initial targets are RPO <= 24 hours and RTO <= 4 hours; these are
targets, not current capabilities, until backup and restore tests are recorded.

## Known risks

- No automated backup job is present in this repository.
- The current Prisma client uses the single `DATABASE_URL` connection.
- Production connection pooling and provider-specific limits still require
  configuration and verification with the chosen host.
