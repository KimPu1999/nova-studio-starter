# Publishing and rollback

1. Create or select a private AI website project.
2. Create a hosted website from that project.
3. Queue a deployment. The server validates ownership, the website schema, and the latest revision.
4. The deployment stores an immutable snapshot and receives an idempotency key.
5. A durable worker must build and publish the snapshot before changing the active deployment.

Failed deployments must not replace the current active deployment. Rollback should activate a previously validated snapshot inside a transaction and write an audit entry. The current repository does not claim that worker or rollback execution is active.
