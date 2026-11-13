# NOVA Studio — Production Deployment

## Selected architecture (single-server starter)

| Component | Selection | Status |
|---|---|---|
| App runtime | Node 22 + `next start` behind a reverse proxy (Nginx/Caddy) on a single VPS | Planned; size to start: 2 vCPU / 4 GB |
| Database | Managed PostgreSQL 16 (or self-hosted on the same VPS with nightly dumps) | Planned |
| Storage | Persistent volume for `PRIVATE_STORAGE_DIR` **or** S3-compatible object storage (adapter is a prerequisite for serverless) | Planned |
| TLS | Reverse proxy with automatic certificates (Caddy / certbot) | Planned |
| Process supervision | systemd unit running `npm run start` (which validates env first) | Planned |
| Scheduler | External cron hitting `POST /api/cron/billing-sweep` hourly with `BILLING_JOBS_TOKEN` | Planned |
| Domain/DNS | Registrar-managed; A/AAAA + optional `*` record for site subdomains | **Requires explicit owner approval before any change** |

## Required environment variables (production)

Validated by `npm run validate:env` (run automatically by `npm run start`):

- `DATABASE_URL` (+ `DIRECT_URL` when using PgBouncer)
- `SESSION_SECRET` ≥ 32 random chars (per environment, never reused)
- `PUBLIC_WEBSITE_URL` (HTTPS)
- `PRIVATE_STORAGE_DIR` on a persistent volume
- `BILLING_JOBS_TOKEN` ≥ 24 chars (optional; unset disables the cron endpoint)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — used only by the one-time `admin:create`; set then unset
- Optional: `AI_ENABLED`, `AI_PROVIDER`, provider keys (server-side only), mailer credentials when the email service is implemented

All secrets: per-environment, vault-managed, rotation documented in `operations.md`.

## Deploy procedure

```bash
# 0. CI green (typecheck, lint, 105 tests, build, audit).
# 1. Pull release
git fetch && git checkout <release-tag>
# 2. Apply migrations (forward-only; verify no drift first)
npx prisma migrate status && npx prisma migrate deploy
# 3. Install + build
npm ci && npm run build
# 4. Verify env contract
npm run validate:env
# 5. Restart service under supervision
systemctl restart nova-studio
# 6. Post-deploy smoke: docs/production/staging.md checklist items 1–4 minimum
curl -s https://<domain>/api/health
```

## Operating cost estimate (explicit assumptions)

Assumption: Myanmar-focused SaaS, ~500–2,000 paying customers year one, single VPS region (e.g. Singapore) for lowest latency to Yangon.

| Item | Assumption | Est. monthly |
|---|---|---|
| VPS 2 vCPU/4 GB + 80 GB SSD | 1× | $24 |
| Managed Postgres (smallest HA-less) | 1× (or self-hosted to save ~$15) | $15–40 |
| Object storage + egress (proofs, ZIPs ~50 GB) | 50 GB | $5–10 |
| TLS | Caddy/certbot (Let's Encrypt) | $0 |
| Error tracking (Sentry team tier) | 1 project | $26 |
| Backups (DB snapshots + storage versioning) | 7-day PITR | $5–15 |
| Domain | annual amortized | ~$1 |
| **Total** | | **~$56–96/month** |

Excludes: CDN, multi-region HA, SSO providers, AI provider spend (usage-based; capped by budget enforcement).

## Missing credentials / provider configuration (blockers to provision)

- [ ] Production server + SSH access
- [ ] Production `DATABASE_URL` (+ pooler) and `SESSION_SECRET`
- [ ] Persistent storage volume (or object-storage adapter for serverless)
- [ ] `BILLING_JOBS_TOKEN` + external scheduler
- [ ] DNS changes (requires written owner approval — not changed in this phase)
- [ ] Email provider for transactional mail (password reset currently non-functional)
- [ ] Error tracking DSN

## Approval gates

No public deployment, no DNS change, and no paid infrastructure activation happened in Phase 19. Each requires the owner's explicit approval recorded in `launch-checklist.md` (G10).
