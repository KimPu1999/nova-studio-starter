# Phase 15 workspaces

## Current implementation

The workspace layer adds organizations, globally unique workspace slugs, transactional owner membership, expiring hashed invitations, workspace-scoped RBAC, shared-project links to the existing AI website projects, client records, immutable revision-bound approval requests, private asset/brand-kit metadata, workspace subscriptions, append-only credit records, usage records, and workspace audit logs.

## Roles

| Role | Scope |
|---|---|
| OWNER | Full workspace control, billing, credits, members, projects, audit |
| ADMIN | Workspace administration, billing, credits, members, projects |
| MANAGER | Members, projects, clients, assets, read-only billing |
| EDITOR | Create/edit projects and assets |
| DEVELOPER | Read/edit projects and assets |
| VIEWER | Read-only workspace and project access |

Platform admin roles remain separate from workspace roles.

## Invitation limitations

Invitation tokens are hashed and expire after seven days. The repository stores invitations securely, but an email delivery adapter is not configured in this environment, so invitations are not automatically sent. Do not expose raw tokens in production logs or UI.

## Shared AI projects

Shared projects use `WorkspaceProject.aiProjectId`; the AI project model is not duplicated. A personal project is never silently transferred. A future transfer workflow must require explicit owner approval and create an audit event.

## Billing and credits

Workspace subscriptions and credit entries are modeled, but paid activation and shared-credit settlement are not enabled. Purchased credits must be issued only after verified manual payment and should use the existing append-only AI ledger rather than a second balance source.

## Migration

```bash
npx prisma validate
npx prisma migrate deploy
npx prisma generate
```

The migration is forward-only. Do not use `prisma db push` or `prisma migrate reset` in production.
