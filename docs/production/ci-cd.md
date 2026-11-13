# NOVA Studio — CI/CD

## Pipeline (GitHub Actions, `.github/workflows/ci.yml`)

Trigger: every push and pull request. **Least privilege: `permissions: contents: read`.**

| # | Step | Purpose |
|---|---|---|
| 1 | `actions/checkout@v4` + `setup-node@v4` (Node 22, npm cache) | Install dependencies |
| 2 | Postgres 16 service container + `prisma migrate deploy` + `prisma validate` | Schema/migration health on an isolated test DB |
| 3 | `npm run validate:env` with `NODE_ENV=production` | Environment contract check |
| 4 | `npm run typecheck` | Strict TypeScript |
| 5 | `npm run lint` | ESLint |
| 6 | `npm test -- --run` | 105 unit/integration tests |
| 7 | `npm run build` | Production build |
| 8 | Build artifact verification | Fails CI if `.next/BUILD_ID` / `prisma generate` client are missing |
| 9 | `npm audit --audit-level=high` | Dependency vulnerability gate |

## Secrets policy

- No repository secrets are used by CI; test env vars are throwaway values declared in the workflow.
- Production secrets live only in the deployment environment (never in the repo, never in CI logs).
- Any future deployment job must read credentials from GitHub **Environment** secrets scoped to `staging` / `production`, with required reviewer approval on production.

## Deployment gating

- CI is the required check for merging. **No automatic deployment is configured.**
- Deployments are manual, operator-executed, per `deployment.md` (staging first, production only after launch-gate sign-off).
- Staging and production use separate databases, storage, secrets, and webhook endpoints (staging.md).

## Local equivalency

```
npm ci && npx prisma migrate deploy && npx prisma validate \
  && npm run typecheck && npm run lint && npm test && npm run build
```

## Change log (Phase 19)

- Added build-artifact verification step (`.next/BUILD_ID` presence + Prisma client check).
- Clarified least-privilege permissions and no-auto-deploy policy in this document.

## Results (2026-11-13)

- All pipeline steps executed locally and PASS (typecheck, lint, 105/105 tests, production build, artifact presence).
- GitHub Actions execution: **NOT RUN** — this phase made no remote commits; the workflow runs on the next push.
