# NOVA Subscription Audit

Audit performed against the current repository before the subscription-plan redesign.

## Existing features found

| Area | Classification | Evidence / finding |
| --- | --- | --- |
| Subscription data model | Implemented and working | `BillingPlan`, versioned pricing, `BillingSubscription`, invoices, payment attempts, entitlements, usage, ledger, and audit models exist in `prisma/schema.prisma`. |
| Plan catalog | Implemented and working | `listActivePlans()` resolves only active plans with an active version. Prices are read from the database. |
| Paid subscription activation | Implemented and working | Paid plans create an invoice and remain pending until a finance reviewer verifies payment server-side. |
| Free plan activation | Implemented and working | Zero-priced plans activate transactionally and sync entitlements. |
| Idempotency and duplicate protection | Implemented and working | Unique invoice/payment/subscription keys and verified-payment checks prevent duplicate entitlement grants. |
| Lifecycle management | Implemented and working | The lifecycle sweep handles end-of-period cancellation, grace period, suspension, and free-plan advancement. |
| Customer dashboard | Implemented, needs UI improvement | `/billing`, `/billing/subscription`, `/billing/invoices`, `/billing/payments`, `/billing/usage`, and `/billing/settings` exist with ownership checks. |
| Billing history | Implemented and working | Customer invoice list/detail pages show real invoice totals, payment attempts, and verification state. |
| Admin billing | Implemented, needs UI improvement | Admin overview, plans, subscriptions, invoices, payments, refunds, reconciliation, and reports exist with role gates. |
| Digital product entitlement separation | Implemented and working | Marketplace download entitlements are order-based; subscription entitlements use `BillingEntitlement`, so cancellation does not revoke one-time licenses. |
| Automatic recurring provider | Missing / not configured | The current system supports manual KBZPay, WavePay, and bank-transfer verification. It does not have a recurring gateway, provider subscription IDs, or automatic renewal webhooks. |
| Provider customer portal / billing method | Missing | No provider-backed billing profile or payment-method management exists. |
| Official invoice PDF | Missing / conditional | No provider invoice PDF integration is configured; the UI should not fabricate one. |
| Admin plan creation | Partial | Admins can create versioned prices and features for existing plans; creating a new plan record is not exposed in the current action/UI. |
| Admin customer detail / resync | Partial | Subscription list and cancellation exist, but a dedicated customer detail/resync workflow is not exposed. |

## Root causes and constraints

1. The configured payment architecture is manual verification, not automatic recurring billing. The UI must not claim automatic renewal or simulate provider events.
2. The subscription schema intentionally versions plans and prices so historical invoices remain stable.
3. Entitlements are activated only from the verified-payment transaction, not from a browser redirect.
4. One-time marketplace licenses are represented by separate order/download-entitlement records and must remain independent of subscription cancellation.

## Work completed in this pass

- Redesigned `/billing/plans` using NOVA Obsidian Edition tokens.
- Added real monthly/yearly pricing toggle using active backend plan versions.
- Added computed yearly monthly-equivalent and savings copy from actual catalog prices.
- Added plan cards with real limits, feature flags, scope selection, and existing subscribe action.
- Added data-backed capability comparison table.
- Added manual-verification explanation, activation steps, FAQ, and terms links.
- Added this audit checklist for future provider integration work.

## Remaining required configuration

- If automatic recurring billing is required, select and integrate a provider that supports subscriptions, customer profiles, payment methods, cancellation, renewals, and signed webhooks. Do not enable a frontend-only recurring flow.
- If official invoice PDFs are required, connect the invoice action to a provider or server-side PDF generation path backed by verified invoice records.
- Add a secure admin create-plan action and dedicated subscription detail/resync view when those operations are approved for the platform.
