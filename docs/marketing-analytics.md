# NOVA Studio Phase 11 Operations Guide

## Metric definitions

- Gross revenue: verified `PAID` marketplace orders, verified `PAID` course
  purchases, and collected amounts on project invoices in `PARTIALLY_PAID` or
  `PAID` state.
- Refunds: only refund requests in `COMPLETED` state, using the approved amount.
- Net revenue: gross revenue minus completed refunds, floored at zero in the
  dashboard display.
- Paid transaction: one paid order, course purchase, or project invoice record.
- Active buyer: a distinct customer appearing in one of those verified sources
  during the selected period.

Payment proofs, pending reviews, rejected payments, invoice totals that have
not been collected, and unverified analytics events are not revenue.

## Campaign setup

1. Open `/admin/marketing/campaigns` as an authorized admin.
2. Create a campaign as `DRAFT`.
3. Review dates, objective, budget, and audience policy.
4. Use “Approve schedule” to move it to `SCHEDULED`.
5. Configure an external, durable delivery worker only after provider, consent,
   unsubscribe, retry, and suppression-list controls are implemented.

The current repository does not send bulk email or execute scheduled campaigns.
The `ACTIVE` state is deliberately not accepted by the campaign save action.

## Consent

Marketing consent is stored separately from transactional email templates. An
operator may review `/admin/marketing/subscribers`, but this page is not a
replacement for collecting lawful consent from customers. Unsubscribe handling,
suppression enforcement, and provider delivery are prerequisites before sending
campaigns.

## Analytics events

The public endpoint is `POST /api/analytics/events`. It accepts only the
allowlisted events in `analyticsEventSchema`, limits payload size, rejects
non-relative paths, and supports UUID idempotency keys for conversion events.
Do not send passwords, payment proofs, private messages, full IP addresses, or
unnecessary personal data. The current in-process rate limit is suitable for
development only; a shared rate limiter is required for multi-instance launch.

## Current limitations

- No email provider or durable marketing queue is configured.
- No abandoned-cart scheduler, referral/affiliate payout workflow, or report
  export worker is active.
- Campaign performance attribution and CSV report jobs are not yet implemented.
- Customer-level analytics require an approved privacy/retention policy.
