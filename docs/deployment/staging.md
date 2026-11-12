# NOVA Studio Staging Plan

Staging must be isolated from production:

- Separate PostgreSQL database and `DATABASE_URL`.
- Separate private-storage namespace or bucket.
- Separate email sender/provider configuration.
- Clearly marked non-production KBZPay/WavePay instructions.
- Dedicated test accounts and no real transfers.
- Restricted access through the selected hosting provider or an access gateway.

## Smoke test checklist

Run after each release candidate:

1. `/api/health` returns a healthy response without exposing infrastructure details.
2. Customer registration, login, logout, and password reset work.
3. Published templates are browsable; drafts are not public.
4. Cart and server-side checkout totals work.
5. Payment proof submission stays pending until admin review.
6. Verified purchase download is authorized; unpaid download is rejected.
7. Project request and proposal acceptance ownership checks work.
8. Course enrollment and paid-course access controls work.
9. Support ticket creation and reply permissions work.
10. CMS publishing and EN/MM switching work.

Record the release commit, database migration state, test account identifiers
(never passwords), and any failed checks. A staging pass is not a production
deployment approval.
