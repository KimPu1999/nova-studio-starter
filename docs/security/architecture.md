# Security architecture

Phase 16 adds security-specific records without replacing the existing session and RBAC system. Security events and audit logs are append-oriented, tenant-aware, and omit secrets. Workspace authorization continues to use `requireWorkspaceAccess` and explicit permissions.

This phase does not claim compliance certification. An independent assessment is required for SOC 2, ISO 27001, GDPR, or other regulatory claims.
