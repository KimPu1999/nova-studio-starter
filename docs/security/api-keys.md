# API credentials

API credentials use random plaintext values only at creation time and store SHA-256 hashes afterward. The database keeps a prefix, scopes, expiry, last-use time, and revocation time; it never stores the full key.

Production API handlers must authenticate the presented key by hash, enforce expiration/revocation, enforce its scopes, enforce workspace membership, rate-limit failures, and write security events. Service accounts must remain workspace-scoped and least-privileged.
