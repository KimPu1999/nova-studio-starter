# NOVA Studio — Launch Readiness Checklist (Go/No-Go)

Legend: **PASS** verified this phase · **FAIL** blocking defect · **BLOCKED** cannot pass until dependency resolves · **NOT RUN** not yet executed.

| # | Gate | Status | Evidence |
|---|---|---|---|
| G1 | No unresolved critical security vulnerabilities | **PASS*** | Phase 19 audit found no CRITICALs; `npm audit --audit-level=high` clean on lockfile at audit time. *Re-run on deploy day. |
| G2 | No unresolved critical financial-integrity defects | **PASS** | H1–H5 fixed (audit-report.md): settlement gating, refund caps, vendor earnings, payout lifecycle, refund reversals. |
| G3 | Tenant isolation tests pass | **PASS** (code-audit level) | No IDOR in sampled surfaces; scoped-query audit clean. Dedicated adversarial test suite: NOT RUN (Phase 20). |
| G4 | Backup restore test passes | **BLOCKED** | No production backup exists to restore; backup-recovery.md procedure defined but NOT PERFORMED. |
| G5 | Payment verification tests pass | **PASS** (unit/integration) | 105/105 automated tests; browser E2E on staging: NOT RUN. |
| G6 | Critical user journeys pass | **NOT RUN** | Staging smoke checklist not executed (no staging provisioned). |
| G7 | Production environment variables verified | **NOT RUN** | Requires production environment (validate:env runs at boot). |
| G8 | Monitoring and alerts verified | **BLOCKED** | Health endpoint PASS; alert channels not configured (monitoring.md). |
| G9 | Rollback procedure tested | **NOT RUN** | rollback.md defines procedure; requires staging rehearsal. |
| G10 | Deployment approval recorded | **PENDING** | No public deploy/DNS/paid infra without explicit owner approval. |
| G11 | MFA enforcement | **BLOCKED** (decision needed) | Implement TOTP (Phase 20) OR obtain signed risk acceptance that single-factor + rate limiting is acceptable at launch. |
| G12 | Password reset deliverable in production | **BLOCKED** | No mailer configured. Blocks real-user registration at launch. |

## Risk acceptance register (noncritical)

| Risk | Acceptance required from |
|---|---|
| U2 Workspace policy values (session/invitation) not enforced | Product owner |
| U3 In-memory concurrency limiter (multi-instance) | Ops (single-instance launch OK) |
| U4/U5 Non-locked balance/seat checks | Product owner (documented mitigations) |
| U6 No CSP header | Security owner (report-only CSP planned) |
| Proof-route key association gap (insider-only) | Security owner |
| Partially-paid invoices never marked OVERDUE | Finance owner |

## Go/No-Go recommendation

**NO-GO for public launch today.** Blocking items: G4 (backup restore), G6 (staging E2E), G7, G9 (rollback rehearsal), G12 (email), and an explicit decision on G11 (MFA). Code-level launch blockers from the Phase 19 audit are resolved; remaining gates are infrastructure and process, achievable in a short staging phase.

**Conditionally GO** for a limited private beta (invite-only, synthetic payments only, no real KBZPay/WavePay rails) once G6 + G7 pass on staging, since G4/G8/G9 can be closed during the beta window with monitoring in place.
