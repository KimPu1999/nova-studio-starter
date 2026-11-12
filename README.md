# NOVA Studio — Next.js Starter

A dark premium website studio + template catalog starter. **This is a front-end MVP scaffold, not a production-ready e-commerce system.**

## Start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Included
- Responsive homepage, template catalog, services, showcase and contact pages
- Placeholder products/prices and changeable brand name in `src/lib/data.ts`
- Next.js App Router, TypeScript, Tailwind CSS v4

## Phase 3 commerce setup

The project includes customer accounts, PostgreSQL-backed carts and orders, manual KBZPay/WavePay configuration, private payment-proof storage, atomic admin review, paid download entitlements, expiring download links, and download audit events.

Before taking real orders:

```bash
cp .env.example .env.local
npm run db:generate
npm run db:migrate -- --name phase3
npm run db:seed
ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="a-long-password" npm run admin:create
```

Configure `DATABASE_URL`, `SESSION_SECRET`, and `PRIVATE_STORAGE_DIR`. Payment methods start disabled and must be configured at `/admin/payment-methods`; no wallet credentials or QR codes are hardcoded.

## Still requires production integration
- Production object storage adapter (the default is private local storage for development)
- Email delivery for password reset messages
- Merchant account verification, policies, licensing, and refunds operations

## Payment architecture recommendation
Order created server-side with locked price → pending_payment → customer submits transaction reference/evidence → admin reconciles against actual wallet transaction → paid → server issues short-lived signed download link. Never grant downloads from a screenshot alone. Restrict evidence uploads to authorized admin access; enforce rate limits and file validation.
