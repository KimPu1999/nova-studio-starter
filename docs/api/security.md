# Security

The developer platform follows the same security posture as the rest of NOVA
Studio. Summary of the guarantees and the honestly-documented limitations.

## Guarantees

1. **Secret handling.** API keys, service-account secrets, OAuth client
   secrets and webhook signing secrets are stored **SHA-256 hashed**
   (lookup/verification) or **AES-256-GCM encrypted** (webhook secrets, which
   must be recoverable for signing). Plaintext is shown exactly once at
   creation and cannot be recovered afterwards. Auth is hash-lookup based, so
   no timing side channel against secrets is meaningful.
2. **Tenant isolation.** Every handler re-derives authorization from the
   database: workspace membership, roles, ownership. Client-supplied ids are
   treated as data, never as authority. Service accounts are pinned to their
   single workspace at the query level.
3. **Scope enforcement.** Exact-match scope checks in every route; OAuth
   scopes clamped to the fixed public list; no admin/power scopes exist in the
   public API.
4. **Abuse controls.** Atomic rate limits, monthly quotas, concurrency cap,
   payload-shape validation via Zod, idempotency-key binding (prevents
   double-execution), and the concurrency-lock on idempotent mutations.
5. **OAuth hardening.** PKCE S256 mandatory, exact redirect URI matching,
   single-use codes whose replay revokes derived tokens, refresh rotation in a
   transaction, `Cache-Control: no-store` on token responses, RFC 7009
   revocation with no information leak, Basic-auth support for confidential
   clients.
6. **Webhook SSRF defense.** URL policy (HTTPS, 443/8443, no userinfo),
   hostname validation, **DNS resolution validated against private/loopback/
   link-local/metadata ranges before connecting**, manual redirect handling
   with per-hop re-validation, 10 s timeouts, 64 KB response cap, 256 KB
   payload cap.
7. **Auditability.** `ApiAuditLog` records credential/webhook/quota/OAuth/
   sandbox administration actions (no secrets, no token values — only
   metadata such as client ids and versions); `ApiUsageEvent` records every
   API call's metadata without bodies.
8. **Consent transparency.** OAuth consent shows the exact clamped scope list;
   users can revoke applications at `/developers/integrations`.

## Known limitations (documented, not hidden)

- **Concurrency cap is per instance** (in-memory). Multi-instance deployments
  scale the effective cap by instance count. Rate limits/quotas are not
  affected.
- **DNS rebinding residual risk.** The hostname is resolved and validated, and
  redirects are re-validated, but the connection is not pinned to the
  validated IP addresses; a malicious authoritative DNS server that returns
  different answers per lookup could, in principle, still reach a private
  host. Production hardening: pin the socket to the validated addresses
  (custom agent) before dispatch.
- **Delivery engine scheduling.** `processWebhookDeliveries` is a library
  function; without infrastructure to invoke it periodically, only the inline
  first attempt and sandbox simulations kick it. Deploy a worker (cron or
  queue consumer) that calls it on an interval.
- **Deployment lifecycle events** (`website.published`,
  `deployment.completed/failed`) are not emitted until the deployment worker
  exists.
- **Token endpoint client auth** accepts HTTP Basic or body secrets;
  `client_secret_post` over TLS is acceptable but Basic is preferred.

## Recommendations for operators

- Keep `SESSION_SECRET` (AES key for encrypted secrets) in a secret manager;
  rotating it invalidates stored webhook secrets until re-encrypted.
- Run the rate-counter cleanup and webhook dead-letter review weekly.
- Watch `/admin/developers/security` for repeated 401/403 clusters on a
  single credential — a likely leaked or misconfigured key.
