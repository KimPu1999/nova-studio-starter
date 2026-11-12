# Hosting operations

Production requires a durable worker for deployment, DNS verification, TLS polling, usage aggregation, subscription expiry, and cleanup. Scheduled endpoints must be authenticated and idempotent.

Required operational controls include private storage, backups, deployment logs, database monitoring, rate limits, quota alerts, and an incident rollback runbook. No worker or infrastructure provider is configured by this phase, so these operations are currently `NOT RUN`.
