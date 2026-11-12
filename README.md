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

## Not implemented (before taking real orders)
- Product detail pages and live demos
- Authentication and admin authorization
- Database, checkout/order creation, payment evidence upload and approval
- KBZPay/WavePay payment instructions and merchant account verification
- Private product storage, expiring signed download URLs, download audit logs
- Secure contact form, email notifications, policies, licensing and refunds

## Payment architecture recommendation
Order created server-side with locked price → pending_payment → customer submits transaction reference/evidence → admin reconciles against actual wallet transaction → paid → server issues short-lived signed download link. Never grant downloads from a screenshot alone. Restrict evidence uploads to authorized admin access; enforce rate limits and file validation.
