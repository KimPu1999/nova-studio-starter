# Phase 13 AI platform

## Current status

The AI layer is disabled by default. The repository now contains a provider-neutral adapter boundary, a versioned and allowlisted website schema, private website projects and revisions, deterministic published-template recommendations, and an append-only credit/usage data model.

No provider SDK or API key is installed, no paid provider is activated, and no credits are charged by the current implementation.

## Migration

```bash
npx prisma validate
npx prisma migrate deploy
npx prisma generate
```

Apply this migration only after the database backup and migration status have been reviewed. Do not use `prisma db push` or `prisma migrate reset` for production.

## Environment

```env
AI_ENABLED=false
AI_PROVIDER=disabled
```

These variables are server-only. There is intentionally no provider secret until an approved adapter is implemented and tested. A future provider must be added behind `src/lib/ai/provider.ts`, with credentials read only on the server.

## Safety boundaries

- Website definitions are validated with Zod and only allow registered section types.
- Text rejects script tags, `javascript:` URLs, inline event handlers, and HTML data URLs.
- AI projects and revisions are scoped to the authenticated owner.
- Generated code is never executed by the application.
- Recommendation results come only from published, approved marketplace templates.
- Credit reservations use conditional database updates and idempotency keys.

## Remaining Phase 13 work

An approved provider adapter, streaming transport, durable generation worker, paid credit purchase flow, full visual editor, AI support/LMS integrations, and end-to-end tests still require implementation and environment-specific verification.
