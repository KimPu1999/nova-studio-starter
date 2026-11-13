# NOVA Studio — Testing

## Test suites (as of 2026-11-13)

| Suite | File(s) | Focus | Result |
|---|---|---|---|
| Billing logic | `tests/billing.test.ts` | State machines, invoice totals, refundable math, quota checks | PASS |
| Billing integration | `tests/billing-integration.test.ts` | Invoice/ledger application paths | PASS |
| AI platform | `tests/ai.test.ts` | Credit reservation math, output schema validation | PASS |
| Public API | `tests/api-v1.test.ts` | Credential auth, scoping | PASS |
| OAuth | `tests/oauth.test.ts` | PKCE, redirect matching, token flows | PASS |
| Webhooks | `tests/webhooks.test.ts` | Signing, payload contract | PASS |
| Security | `tests/security.test.ts`, `tests/security-secrets.test.ts` | Secret hashing/encryption, validation | PASS |
| Workspaces | `tests/workspaces.test.ts` | Role permission matrix | PASS |
| SDK / OpenAPI contract | `tests/sdk.test.ts`, `tests/openapi.test.ts` | Docs/code parity | PASS |
| Validation | `tests/validation.test.ts` | Zod schemas | PASS |
| **Phase 19** | `tests/phase19.test.ts` | Refund cap, reference handling, cron auth, middleware routing | PASS |

**Latest run: 13 files, 105/105 tests PASS (2.0 s).** Type-check: PASS. Lint: PASS. Production build: PASS.

## Test strategy

- **Unit/pure logic (CI, no DB):** state machines, money math, caps, schema validation, auth plumbing, route handlers that guard without touching the DB (cron authorization, middleware).
- **Integration (DB):** `tests/billing-integration.test.ts` exercises service-layer transaction guards; CI runs against an isolated Postgres 16 service database (`nova_studio_test`), never production.
- **E2E (browser):** NOT IMPLEMENTED. A Playwright pass over the critical journeys (register → checkout → submit payment → admin verify → download) is a Phase 20 requirement before public launch. Current journeys are verified manually (see staging.md smoke list).
- **Financial concurrency:** the money paths rely on guarded `updateMany` claims whose correctness is enforced by Postgres; the claim pattern is asserted in the integration suite. Dedicated concurrent-approval stress tests are planned as Phase 20 (NOT RUN in this phase).
- **Security tests:** secret hashing/encryption, OAuth flows, webhook SSRF guards are covered; an external dependency audit (`npm audit --audit-level=high`) gates CI.

## Isolation rules

1. Tests never touch production credentials or data. `.env` is never loaded by vitest (no DB URL is set in the test environment; suites that need one get the CI service database).
2. CI environment uses throwaway values (`ci-admin@example.com`, `CI-only-1234`, `ci-only-secret…`).
3. Database tests create their own rows and never run destructive migrations.

## Known gaps (honest)

- No browser E2E suite yet.
- No concurrent-financial-operation stress harness yet (relies on transaction guard design + code review).
- No load/performance test harness yet.
- Admin/vendor UI is verified manually; no component tests.
