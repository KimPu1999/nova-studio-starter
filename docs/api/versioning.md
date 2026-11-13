# Versioning

## REST

- The API is versioned in the URL: **`/api/v1`**. Within a major version,
  changes are **additive only**: new endpoints, new optional request fields,
  new fields in response objects, new event types.
- Removing or renaming fields, changing semantics, or tightening validation
  constitutes a breaking change and would ship as `/api/v2`.
- Unknown properties in response objects should be tolerated by clients.
- The current contract is published as **OpenAPI 3.1** at `openapi.yaml`
  (repository root) and is validated against the implemented route table in
  CI (`tests/openapi.test.ts`).

## Webhook events

- Every webhook payload carries a **`version`** (currently `2026-11-13`,
  matching the release date).
- Subscriptions are pinned to a version: endpoints receive only events whose
  version matches their subscription, so a breaking event change ships as a
  **new version that you opt into** by updating the subscription.
- Additive fields inside `data` may appear without a version bump; treat
  unknown fields as ignorable.

## Deprecation policy

When something must be removed, it will first be marked deprecated in the
changelog (`/developers/changelog`) and docs, continue to function for a
stated grace period, and only then be removed in a new major version.
