# OAuth 2.0

NOVA Studio implements the OAuth 2.0 **authorization code** flow with
**mandatory PKCE (S256 only)**, plus refresh-token rotation and RFC 7009
revocation. Implicit and password grants are not supported.

## Roles

- **Developer application** → one or more **OAuth clients** (`nova_c_…`
  client id, secret stored hashed). Client types: `PUBLIC` (SPA/mobile, PKCE
  only) and `CONFIDENTIAL` (must authenticate with its secret).
- Users approve consent at `/oauth/authorize`.

## 1. Authorization request (browser)

```
GET /oauth/authorize?
    response_type=code
    &client_id=nova_c_…
    &redirect_uri=https://app.example.com/callback
    &scope=profile:read%20projects:read
    &state=<random>
    &code_challenge=<BASE64URL(SHA256(verifier))>
    &code_challenge_method=S256
```

Rules enforced server-side:

- `code_challenge_method` must be exactly `S256` (no `plain`).
- `redirect_uri` must **exactly match** a registered URI (no prefix/suffix or
  substring matching — RFC 6819 §4.1.5).
- Requested scopes are **clamped** to the intersection of the fixed public
  scope list and the scopes registered on the client.
- Authorization codes live 5 minutes and are single-use.

## 2. Token exchange

```
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=nova_ac_…
&redirect_uri=https://app.example.com/callback
&client_id=nova_c_…
&client_secret=nova_cs_…        (confidential clients; HTTP Basic also accepted)
&code_verifier=<verifier>
```

Success (200, `Cache-Control: no-store`):

```json
{
  "access_token": "nova_at_…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "nova_rt_…",
  "scope": "profile:read projects:read"
}
```

Errors use RFC 6749 bodies: `invalid_request`, `invalid_client` (401),
`invalid_grant`, `unsupported_grant_type`, `invalid_scope`, `server_error`.

Security properties:

- **PKCE**: the code binds to `code_challenge`; a verifier mismatch fails.
- **Single-use codes with replay → revocation**: consuming an already-consumed
  code revokes every token previously derived from it (RFC 6749 BCP).
- **Refresh rotation**: presenting a refresh token revokes it and mints a new
  pair in one transaction. Reuse of a rotated token fails with
  `invalid_grant`. Refresh tokens live 30 days.

## 3. Refresh

```
POST /api/v1/oauth/token
grant_type=refresh_token&refresh_token=nova_rt_…&client_id=…&client_secret=…
```

## 4. Revocation (RFC 7009)

```
POST /api/v1/oauth/revoke
token=nova_at_…&client_id=nova_c_…
```

Always responds 200, even for unknown tokens (no information leak). Users can
also disconnect an integration from `/developers/integrations`, which revokes
all live tokens for that application.

## Notes & current scope

- Access tokens currently carry a user identity; the workspace binding on
  tokens minted by the authorization-code grant is null (user-scoped), so
  tenant resolution happens through live workspace membership checks per call.
- Scopes never include platform-admin abilities. See [scopes.md](scopes.md).
