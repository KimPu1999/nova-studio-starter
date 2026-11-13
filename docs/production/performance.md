# NOVA Studio — Performance

Measure-first policy: no optimization is reported as done without a number attached.

## Baselines (2026-11-13, local production build)

| Metric | Value | Source |
|---|---|---|
| Shared First Load JS (all routes) | **103 kB** | `next build` output |
| Largest page bundle | 2.37 kB page JS (templates catalog) + 103 kB shared | `next build` |
| Middleware size | 34.2 kB | `next build` |
| Test suite wall time | 2.0 s / 105 tests / 13 files | `vitest run` |
| TypeScript check | clean, ~279 kB incremental cache | `tsc --noEmit` |

These are **local-machine numbers**, not production Core Web Vitals. Real-user CWV requires a deployed environment and field data (see staging.md).

## Observations from `next build`

- Every page is server-rendered on demand (`ƒ`); the only static assets are framework chunks. Heavy admin surfaces are behind auth and not publicly cacheable — correct for a multi-tenant app.
- 103 kB shared JS is modest for the feature surface; lucide-react icons are tree-shaken per route.

## Optimization decisions already in place

- Server Components by default; client JS only in interactive forms (checkout, AI builder, OAuth consent, admin forms).
- Private/tenant data is fetched per request without shared cache (`dynamic = 'force-dynamic'` on dashboards) — deliberately avoiding cross-user cache leakage.
- Pagination is applied on list pages (take limits of 20–100 rows) and admin tables render bounded result sets.
- Durable rate-limit counters use single-row atomic upserts instead of scan queries.

## Deferred work (measured before optimizing — NOT RUN against production)

1. **Core Web Vitals / Lighthouse on deployed staging** — requires staging deployment; NOT RUN in this phase. Gate: CLS < 0.1, LCP < 2.5 s, INP < 200 ms on homepage, templates, checkout.
2. **`EXPLAIN ANALYZE` on hot queries** (order lists, ledger sums, analytics aggregation) — requires realistic data volume (≥ 100k orders). Schema already carries composite indexes for the sampled hot paths (`@@index([orderId, status, createdAt])`, `@@index([vendorId, status, requestedAt])`, invoice number/account indexes).
3. **Image delivery** — no `next/image` usage audit performed; marketplace thumbnails are URL fields. Candidate Phase 20 task once a CDN domain is chosen.
4. **Bundle analysis** (`@next/bundle-analyzer`) — NOT RUN; shared chunk is already below the 150 kB budget.
5. **Connection pooling under load** — PgBouncer sizing requires production-scale load testing. NOT RUN.

## Cache policy (safety)

- Never cache tenant-private responses across users. Only fully public pages (homepage, marketing, storefronts) may use shared caches at the CDN edge; everything under `/admin`, `/account`, `/billing`, `/workspaces`, `/hosting`, `/ai`, `/developers`, `/vendor` must remain `no-store` or force-dynamic.
- Health endpoint sets `no-store`; cron endpoint sets `no-store`.
