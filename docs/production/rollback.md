# NOVA Studio — Rollback

## Application rollback (git + rebuild)

```bash
# 1. Identify last known-good release (tag or commit)
git fetch --tags && git log --oneline -5
# 2. Check out the good release
git checkout <good-ref>
# 3. Rebuild and restart
npm ci && npm run build && systemctl restart nova-studio
# 4. Verify
curl -s https://<domain>/api/health   # expect {"status":"ok"}
```

Target: < 15 minutes. Keep the previous release's `.next` build by building with `next build` into a release-suffixed directory (or use a symlinked release directory: `releases/<ts>` → `current`) so rollback is a symlink flip + restart.

## Database rollback policy

Migrations are **forward-only**. Never `migrate reset` or hand-rollback a migration on production. A bad migration is corrected by a new forward migration (add-back or no-op repair). Financial tables are append-only; if a code defect posted wrong ledger rows, repair with explicit, audited, idempotency-keyed correcting entries — never deletes/updates.

## Feature-level rollback (kill switches)

- `AI_ENABLED=false` disables the AI builder without a redeploy.
- `BILLING_JOBS_TOKEN` unset (or removed from the scheduler) disables the billing sweep endpoint.
- Payment methods can be disabled per method in Admin → Payment methods (checkout stops offering them).
- Maintenance mode banner is available under Admin → Settings → Maintenance.

## Rollback triggers (post-launch)

- Checkout or payment verification producing wrong entitlements/amounts.
- Tenant-data exposure or auth bypass.
- 5xx rate > 5% sustained 10 minutes and not explained by a third party.
- Ledger/invoice totals diverging from wallet/bank statements.
- Health endpoint failing after a deploy (compare pre/post deploy state).

## Rehearsal (required before production sign-off)

Run steps 1–4 on **staging** against the previous release; record wall time and verification output. Status: **NOT RUN** (no staging provisioned yet). This is gate G9 of the launch checklist.
