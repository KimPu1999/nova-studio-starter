# NOVA Studio — Production Architecture

Last updated: 2026-11-13 (Phase 19)

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript 5.9 (strict) |
| Styling | Tailwind CSS 4, custom dark theme (`src/app/globals.css`, `admin.css`) |
| Database | PostgreSQL 16, Prisma ORM 6 (195 models, 17 forward-only migrations) |
| Auth | Custom session auth (bcrypt + SHA-256-hashed opaque tokens, HttpOnly/Strict cookies), DB-backed login throttling |
| Validation | Zod 4 at every server boundary |
| Payments | Manual KBZPay / WavePay / bank verification (three flows: SaaS billing, marketplace orders, project invoices) |
| AI | Server-side provider adapter (`src/lib/ai/provider.ts`), credit reservation/settlement ledger |
| Hosting | Website publishing engine with subdomain/custom-domain model (`src/lib/hosting/`) |
| Developer platform | Public REST `/api/v1`, OAuth 2.0 (PKCE S256), signed webhooks, durable rate limits |
| Storage | Private filesystem adapter (`.private-storage`); object-storage adapter is a documented prerequisite for serverless deploys |

## Request flow

```
Browser ──> Next.js middleware (cookie-presence redirect; defense-in-depth only)
        ──> Server Component / Route Handler
        ──> Server-side auth (requireUser / requireAdmin / authenticateApiRequest)
        ──> Zod validation + csrfCheck (Origin/Host)
        ──> Prisma (tenant-scoped findFirst / guarded updateMany)
        ──> Append-only ledger / audit rows
```

- **No secret ever reaches the client.** API keys, OAuth secrets, and webhook secrets are stored hashed (SHA-256) or AES-256-GCM encrypted (`src/lib/security/secrets.ts`) and shown once at creation.
- **Tenant scoping is enforced per query** (`findFirst({ where: { id, userId|ownerId|membership } })`) rather than by middleware, so a missed middleware entry cannot expose data.

## Module map (Phases 1–18)

1. Homepage/design system — `src/app/page.tsx`, `globals.css`
2. Marketplace — `templates`, `cart`, `checkout`
3. Customer auth/checkout — `login`, `register`, `checkout`, `orders/[orderId]/payment`
4. Licensing/downloads — `src/lib/licensing.ts`, `src/lib/downloads.ts`, `/api/download/[token]`
5. Custom website services — `request-project`, `projects`, `proposals`, `project-invoices`
6. CMS/localization — `admin/cms/*`, `blog`, `pages/[slug]`
7. LMS — `admin/courses`, `learn/*`, `lms-actions.ts`
8. Support — `support/*`, `admin/support/*`
9. Security foundation — `src/lib/auth.ts`, `src/lib/security/*`
10. Deployment infra — `next.config.mjs`, `.github/workflows/ci.yml`, `scripts/validate-env.ts`
11. Analytics/marketing — `admin/analytics`, `admin/marketing`, `/api/analytics/events`
12. Multi-vendor marketplace — `sell`, `vendor/*`, `admin/vendors/*`, `src/lib/vendor-ledger.ts`
13. AI website builder — `ai/builder/*`, `src/lib/ai/*`
14. Publishing/hosting — `hosting/*`, `src/lib/hosting/renderer.tsx`
15. Enterprise workspaces — `workspaces/*`, `src/lib/workspaces.ts`
16. Enterprise security — `admin/security/*`, `src/lib/security/secrets.ts`
17. Public API/webhooks — `api/v1/*`, `src/lib/api-v1.ts`, `src/lib/webhooks/*`
18. SaaS billing — `billing/*`, `src/lib/billing/*`, `admin/billing/*`

## Phase 19 additions

- `src/middleware.ts` — cookie-presence route guard (defense-in-depth; real auth stays server-side).
- `src/app/api/cron/billing-sweep/route.ts` — Bearer-token-guarded billing sweep endpoint for external schedulers.
- `src/app/admin/vendors/payouts/page.tsx` + payout actions — vendor payout lifecycle (approve/reject/complete/cancel with ledger reservation release).
- Hardened `reviewPaymentAttempt` (full-settlement gating), `reviewCreditNote`/`completeCreditNote` (cumulative refund cap), legacy payment reviews (finance roles + separation of duties).
- HSTS header, analytics ingestion rate limit, OAuth deny-path redirect validation.

See `audit-report.md` for the full Phase 19 audit and what was verified.
