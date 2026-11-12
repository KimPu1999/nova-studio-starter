# NOVA Studio Vendor Marketplace Operations

## Registration and approval

1. A signed-in customer submits `/sell/apply`.
2. The application is stored as `SUBMITTED`; no vendor membership is granted.
3. An authorized admin reviews `/admin/vendors/applications/[id]`.
4. Approval creates a verified `VendorProfile` and `VENDOR_OWNER` membership in
   one transaction.
5. Repeated approval is rejected by the server.

Identity verification is manual. No KYC provider is integrated.

## Product moderation

Vendor products are created with `Template.status = DRAFT` and
`vendorStatus = SUBMITTED`. They are not publicly listed until an authorized
moderation workflow marks them approved and the normal template publication
workflow publishes them. Uploaded archives are stored using the existing private
storage adapter and only the ZIP signature/size are checked; malware scanning
and archive-content inspection are still required before production launch.

## Commission and ledger rules

- Commission is an integer basis-point rate: `floor(unitPriceMmk * rateBps / 10000)`.
- The rate and calculated amounts are copied into `OrderItem` at checkout.
- Platform-owned items have no vendor commission snapshot.
- When an order changes to verified `PAID`, a database trigger creates one
  `VendorEarning`, one `SALE_CREDIT`, and one negative `PLATFORM_COMMISSION`
  ledger entry per vendor item.
- Ledger entries are append-only. Corrections require compensating entries.
- A seven-day holding period is currently assigned to new earnings.

Configure at least one `VendorCommissionRule` before allowing vendor sales. A
missing rule currently produces a zero commission rate, so this should be treated
as a configuration blocker rather than a production default.

## Payout verification

Payout requests require an active vendor membership, finance permission, an
active payout account, sufficient ledger balance, and an idempotency key. The
request transaction creates a negative `PAYOUT_RESERVATION` entry, preventing
concurrent overdraw.

Admins must verify the actual KBZPay, WavePay, or bank transfer externally before
creating a payout transaction and marking the request `PAID`. No real payout is
initiated by the current implementation.

## Permission matrix

| Role | Products | Store settings | Finance | Team |
|---|---|---|---|---|
| VENDOR_OWNER | Yes | Yes | Yes | Yes |
| VENDOR_MANAGER | Yes | Limited | No | Limited |
| VENDOR_EDITOR | Yes | No | No | No |
| VENDOR_FINANCE | No | No | Yes | No |

All access is scoped to active membership rows for the requested vendor. Vendor
roles never grant platform admin access.

## Current limitations

- Admin product moderation UI, commission-rule UI, team invitations, vendor
  reviews, and payout review UI are not complete.
- Existing checkout snapshots vendor data and the database trigger creates
  earnings, but coupon allocation across vendor items and partial refund ledger
  reversals still require implementation.
- Existing local private storage remains unsuitable for serverless production.
- Migration application and integration/E2E tests require a working isolated
  PostgreSQL environment.
