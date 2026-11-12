# NOVA Studio Hosting Options

## Recommended architecture

For a public marketplace with private paid files, use a managed Next.js host,
managed PostgreSQL, private S3-compatible object storage, and a transactional
email provider. This minimizes database and TLS maintenance while keeping paid
files outside the application web root.

The current repository is not ready for that architecture because private files
are stored on the local filesystem. An object-storage adapter and migration of
existing private objects are launch prerequisites.

## Option A: managed cloud

Typical components are Vercel Pro (Next.js), managed PostgreSQL, private
S3-compatible storage, transactional email, and a durable worker/cron service
for scheduled publishing, notifications, cleanup, and SLA work.

Advantages: low operational maintenance, simple preview environments, managed
TLS, and straightforward horizontal scaling. Limitations: serverless runtime
limits, external storage requirements, provider-specific egress costs, and the
need to configure background jobs separately.

## Option B: budget VPS

Use a commercial-use VPS with an Ubuntu LTS release, Node.js LTS, Nginx or Caddy
for HTTPS, a process supervisor, a private object-storage service, and a managed
or separately protected PostgreSQL database. Run the app as a non-root user and
keep PostgreSQL off the public interface.

Advantages: predictable single-server cost and persistent disk. Limitations:
patching, firewalling, backups, TLS renewal, monitoring, failover, and scaling
become the operator's responsibility. A persistent local filesystem can work
only after a backup and restore plan is operational; it is not suitable for a
serverless deployment.

No provider prices are asserted here. Confirm current commercial-use terms,
limits, regional availability, storage egress, database backups, and alerting
before purchasing a service.

## Selection rule

Choose managed cloud when operational time and reliable previews matter most.
Choose a VPS only when the team accepts on-call infrastructure responsibility
and has verified backups, private storage, HTTPS, monitoring, and recovery.

Do not provision either option, purchase services, change DNS, or deploy without
explicit approval.
