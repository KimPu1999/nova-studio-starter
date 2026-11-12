# Hosting architecture

Phase 14 stores customer websites as validated component definitions. A hosted website belongs to the authenticated user and an AI website project. A deployment stores an immutable JSON snapshot of a validated revision. The current implementation creates `QUEUED` deployments only; no worker or public hosting provider is configured.

The production architecture should use a durable worker, private object storage, a provider abstraction for DNS/TLS, and an isolated renderer. The renderer must only use the allowlisted section registry in `src/lib/hosting/renderer.tsx`.

## Current limitations

- No DNS records are changed.
- No TLS certificate is provisioned.
- No custom hostname is activated.
- No deployment worker is running.
- Hosting subscriptions and invoices are data-modelled but not activated by payment verification.
