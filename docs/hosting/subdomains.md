# Subdomains

Configure a real platform hostname through `PUBLIC_WEBSITE_URL` or a separate server-side hosting configuration. The application does not invent a production domain and does not modify DNS.

Before enabling subdomains, configure wildcard DNS/TLS at the selected hosting provider, reserve administrative names, and route requests through a tenant lookup that verifies the hostname is active. Hostnames must be normalized and globally unique in `WebsiteDomain`.
