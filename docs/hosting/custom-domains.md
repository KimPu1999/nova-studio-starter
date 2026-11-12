# Custom domains

Custom domains must be normalized, globally unique, and verified through a provider-supported DNS or HTTP challenge. A hostname entered by a customer is never sufficient proof of ownership.

The `WebsiteDomain` and `DomainVerification` tables retain verification state and token hashes. A future provider adapter must keep API credentials server-side, retry safely, and mark a domain `ACTIVE` only after provider verification and TLS readiness.
