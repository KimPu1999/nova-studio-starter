# Permission model

Platform roles, vendor roles, and workspace roles remain separate. Workspace permissions are centrally defined in `src/lib/workspaces.ts` and enforced server-side. A client-supplied role never grants access.

Sensitive operations should use explicit resource ownership checks plus the required workspace permission. Deny by default when the resource, membership, or policy cannot be resolved.
