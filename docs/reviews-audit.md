# NOVA Product Reviews Audit

Audit scope: customer product reviews and ratings only. Admin payment-receipt review flows were inspected separately and are not part of this system.

## Existing functionality

| Area | Status | Evidence / finding |
| --- | --- | --- |
| Product review database model | Working, partial | `ProductReview` stores `productId`, `customerId`, `orderItemId`, rating, title, content, status, and timestamps. `productId + customerId` is unique and `orderItemId` is unique. |
| Purchase eligibility | Working | `src/app/reviews/actions.ts` requires the submitted order item to belong to the authenticated user and an order with `status: PAID`. The client-supplied IDs are re-checked server-side. |
| Review create/edit | Working, partial | `saveReview` creates or updates the customer’s review. There is no customer-facing review form route or account review management page. |
| Product detail reviews | Working, partial | `/templates/[slug]` loads active reviews for the current product and calculates an average from that product’s rows. It renders title, stars, content, and customer name. |
| Public reviews index | Missing | No `/reviews` route exists. |
| Rating aggregation | Partial | Product detail calculates a small in-memory average from the 10 loaded reviews; there is no total count, distribution, or reusable aggregate query. |
| Moderation | Working, partial | `/admin/reviews` can list 50 reviews and toggle `ACTIVE`/`HIDDEN`; actions are role-gated and audited. There are no filters, pagination, reasons, detail view, reply, or moderation event model. |
| Reporting | Partial / broken risk | `reportReview` creates a report but does not verify the target is active, prevent self-reporting, prevent duplicate reports, capture an explanation, or revalidate a customer-facing page. |
| Report moderation | Missing | `ReviewReport` exists, but no admin report queue or resolution action is exposed in `/admin/reviews`. |
| Helpful votes | Missing | No vote model, unique constraint, route, or server action exists. |
| Review images | Missing | No review-image model, private staging flow, validation, or public approved-media route exists. |
| Admin/seller replies | Missing | No reply model, action, or UI exists. |
| Customer review management | Missing | No `/account/reviews` page or edit/delete workflow exists. |
| Notifications | Missing | Review actions do not notify customers or moderators through the existing notification system. |
| Review search/filter/sort/pagination | Missing | No public review index exists; admin list is fixed to the newest 50 records. |
| SEO review structured data | Missing | No review aggregate structured data is emitted; this is currently safe because no fake aggregate is present. |

## Root causes

1. Reviews were added as a minimal product-detail/admin feature rather than as a complete public marketplace subsystem.
2. The existing model intentionally supports one review per customer/product and one review per order item, but lacks the supporting image, vote, reply, and moderation-event records required by the requested workflow.
3. The only customer write path is a server action; no public form or account surface exposes it.
4. The admin page uses a fixed `take: 50` query and has no query parameter filters or server-side pagination.
5. Reports are persisted but are not protected by a uniqueness constraint or connected to an admin resolution workflow.

## Classification summary

### Working

- Authenticated review submission service action.
- Server-side paid-order eligibility check.
- One-review-per-customer/product uniqueness.
- Product-specific active-review loading on template details.
- Basic active/hidden admin moderation with role checks and audit log entries.

### Implemented but incomplete

- Product detail review presentation.
- Admin review list and hide/show action.
- Review reporting persistence.
- Average rating calculation.

### Frontend-only or not exposed

- There is no review form UI, public review index, customer review dashboard, or review-management control surface.

### Missing

- Helpful votes, image uploads, replies, moderation events, report queue, pagination/filtering/search, notifications, and verified-purchase display metadata.

## Safe implementation order

1. Add review-support schema and migration: images, helpful votes, replies, moderation events, report uniqueness, and optional report explanation.
2. Extract shared server-side queries for published reviews and rating aggregates.
3. Build `/reviews` with real data, filters, pagination, and empty states.
4. Upgrade template detail review sections and add an authenticated write-review form.
5. Add customer review management and report/helpful actions.
6. Expand `/admin/reviews` with metrics, filters, pagination, report resolution, replies, and audited reasons.
7. Add secure image processing/storage and notifications only where supported by existing infrastructure.
8. Add targeted tests before enabling review structured data.
