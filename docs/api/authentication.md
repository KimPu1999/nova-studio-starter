# Authentication

All `/api/v1` requests (except `/api/v1/oauth/token` and `/api/v1/oauth/revoke`)
require:

```
Authorization: Bearer <credential>
```

Four credential kinds are accepted. Lookup is by SHA-256 hash, so a stolen
database dump contains no usable secrets.

| Kind | Format | Scope source | Tenant binding |
| --- | --- | --- | --- |
| Personal / workspace API key | `nova_sk_…` | Granted at creation | Optional workspace binding |
| Service account secret | opaque secret | Granted at creation | Pinned to one workspace |
| OAuth access token | `nova_at_…` | Consent grant | Optional workspace scope |
| Sandbox key | `nova_sb_…` | Fixed sandbox scope set | Its own sandbox record |

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | No Bearer credential sent |
| `INVALID_CREDENTIAL` | 401 | Unknown or malformed credential |
| `EXPIRED_CREDENTIAL` | 401 | `expiresAt` passed |
| `CREDENTIAL_REVOKED` | 401 | Revoked (revocation is immediate and permanent) |

## Handling

- Store credentials in server-side secret managers or environment variables.
  Never ship an API key in browser JavaScript.
- Sandbox keys are only valid on `/api/v1/sandbox/*`; anywhere else returns
  `SANDBOX_ONLY` (400). Production credentials calling sandbox endpoints also
  receive `SANDBOX_ONLY`.
- On `401`, stop retrying — fetch or rotate a credential.
- On `403 INSUFFICIENT_SCOPE`, the credential exists but lacks the scope named
  in the message. Create a new credential with the required scopes; scopes are
  immutable on existing credentials.
- Reuse the `x-request-id` header in support requests.
