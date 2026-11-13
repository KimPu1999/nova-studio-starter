# NOVA Studio — Security Review

Date: 2026-11-13 (Phase 19)

## Authentication

| Control | Status | Notes |
|---|---|---|
| Password hashing | PASS | bcrypt cost 12 (`bcryptjs`), single generic failure message. |
| Session tokens | PASS | 32-byte random tokens, SHA-256 hashed at rest, 8 h expiry, HttpOnly + Secure (prod) + SameSite=Strict cookies. |
| Session hygiene | PASS | Login revokes all prior sessions; password reset revokes all sessions. |
| Brute force | PASS | DB-backed throttle: 8 attempts / 15 min per email, cleared on success. Gap: no per-IP dimension (LOW). |
| MFA | **NOT IMPLEMENTED (HIGH)** | TOTP enrollment UI exists but no credential is ever verified; `SecurityPolicy.requireMfa` is write-only. Must be implemented or formally risk-accepted before launch. |
| SSO | PASS | OAuth 2.0 client platform (PKCE S256 mandatory, exact-match redirect URIs, single-use codes with replay revocation, refresh-token rotation). |
| Password reset | PARTIAL | Tokens hashed + single-use + 30-min TTL; **delivery requires a mailer (not configured)** — dev-only token display. |

## Authorization & tenant isolation

- Every privileged action calls `requireUser` / `requireAdmin(roles)` / `requireFinanceAdmin` / `requireWorkspaceAccess` / `requireVendorMember` / `authenticateApiRequest` server-side. PASS for all sampled surfaces (hosting sites, AI builder, webhooks, workspaces, support, projects/files, `/api/v1`, admin billing).
- Tenant scoping uses `findFirst({ where: { id, owner } })` everywhere sampled; a repo-wide search found **zero** unscoped `findUnique({ where: { id … }})` fetches in `src/app`/`src/lib`. No IDOR identified.
- Separation of duties: self-approval is blocked on Phase 18 payments/refunds **and now** on legacy marketplace/project-invoice reviews and support refund reviews.
- Financial RBAC: `FINANCE_ADMIN` required for payment verification, refunds, reconciliation, and vendor payout decisions.

## Input handling & injection

- Zod validation on every server-action and `/api/v1` boundary. PASS.
- CSRF: Origin/Host check (`csrfCheck()`) across all server actions; Next.js App Router adds its own origin checks for server actions. PASS. Note: absent `Origin` header passes the manual check (standard limitation; browser same-site rules + SameSite=Strict cookies cover the realistic surface).
- XSS: zero `dangerouslySetInnerHTML` in `src`. AI-generated sites are rendered as React nodes from Zod-validated schemas; URLs must be http(s) (http allowed — LOW, documented). PASS.
- Path traversal: private storage rejects `/`, `\`, `..` and applies `path.basename`. PASS.
- SSRF: webhook fetch is HTTPS-only, port-allowlisted, blocks localhost/`.local`/`.internal`, private IPv4 (incl. 169.254.169.254, CGNAT) and IPv6 ULA/link-local, resolves DNS and rejects if any record is private, re-validates each redirect hop, caps response size. PASS. Residual: DNS-rebinding between validation and connect (documented; IP pinning is a Phase 20 candidate).

## Secrets

- Stored hashed (API keys, OAuth codes/tokens/secrets) or AES-256-GCM encrypted (webhook signing secrets) keyed by `SESSION_SECRET` (≥ 32 chars enforced).
- Plaintext secrets are returned exactly once at creation; listings show prefixes only.
- No `console.*` calls exist in `src` — nothing is logged, so nothing leaks.
- `.env` is gitignored; `.env.example` contains placeholders only.

## Network controls

- Headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and now **HSTS**. **No CSP yet** — report-only CSP recommended in Phase 20 (current UI uses inline styles).
- Middleware: cookie-presence guard redirects unauthenticated users away from protected areas (defense-in-depth only; real checks are server-side per page/action).
- `/api/v1`: durable Postgres rate limiting + monthly quotas; in-memory per-instance concurrency cap (documented limitation for multi-instance deploys).
- Analytics ingestion: now capped 120 req/h per client IP (best-effort — `x-forwarded-for` is spoofable).

## Dependency security

- `npm audit` runs in CI at `--audit-level=high` and must pass for the build job to complete.
- Review cadence: on every CI run; manual review of advisories monthly.

## Unresolved risks (must be in the launch risk register)

1. **MFA not enforced** (HIGH) — implement TOTP or obtain signed risk acceptance.
2. **No mailer** — password reset non-functional in production (HIGH for real users).
3. **No CSP** (MEDIUM).
4. **Workspace policy values not enforced** (session duration / invitation expiry) (MEDIUM).
5. DNS-rebinding residual on webhook delivery (LOW, documented in code).
6. Per-IP analytics throttle is spoofable (LOW; spam mitigation only).
