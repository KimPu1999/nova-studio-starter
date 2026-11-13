import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { disableSandboxAdminAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminDeveloperSecurityPage() {
  await requireAdmin();
  const now = new Date();
  const [revokedKeys, expiredKeys, serviceAccounts, disabledSandboxes, failedAuthToday, audit, suspiciousEndpoints] = await Promise.all([
    prisma.apiCredential.count({ where: { revokedAt: { not: null } } }),
    prisma.apiCredential.count({ where: { revokedAt: null, expiresAt: { not: null, lte: now } } }),
    prisma.serviceAccount.count({ where: { revokedAt: { not: null } } }),
    prisma.developerSandbox.count({ where: { status: { not: 'ACTIVE' } } }),
    prisma.apiUsageEvent.count({ where: { statusCode: { in: [401, 403] }, createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) } } }),
    prisma.apiAuditLog.findMany({ include: { user: { select: { email: true } }, workspace: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.apiUsageEvent.groupBy({ by: ['credentialId'], where: { statusCode: { in: [401, 403] }, createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) }, credentialId: { not: null } }, _count: { id: true }, orderBy: { _count: { credentialId: 'desc' } }, take: 10 }),
  ]);

  const recentKeys = await prisma.apiCredential.findMany({ where: { revokedAt: { not: null } }, include: { user: { select: { email: true } } }, orderBy: { revokedAt: 'desc' }, take: 20 });

  return (
    <main className="admin-content max-w-6xl">
      <p className="eyebrow">DEVELOPER PLATFORM</p>
      <h1 className="admin-title">Credential security.</h1>
      <p className="mt-2 text-sm text-slate-400">Revocation state and the developer-platform audit trail. Secrets are only ever stored hashed or AES-256-GCM encrypted; plaintext is shown exactly once at creation and is unrecoverable by design.</p>

      <div className="admin-stat-grid mt-8">
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-red-300">{revokedKeys}</p><p className="mt-1 text-xs text-slate-500">Revoked API keys</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-amber-300">{expiredKeys}</p><p className="mt-1 text-xs text-slate-500">Expired but unrevoked keys</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{serviceAccounts}</p><p className="mt-1 text-xs text-slate-500">Revoked service accounts</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{disabledSandboxes}</p><p className="mt-1 text-xs text-slate-500">Disabled sandboxes</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-amber-300">{failedAuthToday}</p><p className="mt-1 text-xs text-slate-500">401/403 responses (24h)</p></div>
      </div>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Recently revoked API keys</h2>
        {recentKeys.length === 0 ? <p className="admin-empty mt-4">No revoked keys.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>Name</th><th>Owner</th><th>Prefix</th><th>Revoked</th></tr></thead>
            <tbody>
              {recentKeys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td className="text-xs text-slate-400">{key.user.email}</td>
                  <td className="font-mono text-xs">{key.keyPrefix}…</td>
                  <td className="text-xs text-slate-500">{key.revokedAt?.toISOString().slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-panel mt-6">
        <h2 className="font-semibold">Audit trail (latest 30)</h2>
        {audit.length === 0 ? <p className="admin-empty mt-4">No developer-platform audit entries yet.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>Action</th><th>Actor</th><th>Workspace</th><th>Request</th><th>When</th></tr></thead>
            <tbody>
              {audit.map((entry) => (
                <tr key={entry.id}>
                  <td className="font-mono text-xs">{entry.action}</td>
                  <td className="text-xs text-slate-400">{entry.user?.email ?? '—'}</td>
                  <td className="text-xs text-slate-400">{entry.workspace?.name ?? '—'}</td>
                  <td className="font-mono text-xs">{entry.requestId ?? '—'}</td>
                  <td className="text-xs text-slate-500">{entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')}Z</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {suspiciousEndpoints.length > 0 && (
        <section className="admin-panel mt-6">
          <h2 className="font-semibold">Credentials with 401/403 responses (24h)</h2>
          <p className="mt-2 text-xs text-slate-500">Repeated auth failures can indicate a leaked or misconfigured credential. Consider asking the owner to rotate it.</p>
          <ul className="mt-3 space-y-1 text-xs text-slate-400">
            {suspiciousEndpoints.map((row) => <li key={row.credentialId}>{row.credentialId}: {row._count.id} failed response(s)</li>)}
          </ul>
        </section>
      )}

      <section className="admin-panel mt-6">
        <h2 className="font-semibold">Sandbox controls</h2>
        <SandboxControls />
      </section>

      <Link href="/admin/developers" className="btn-outline mt-8 inline-block">Back to overview</Link>
    </main>
  );
}

async function SandboxControls() {
  const sandboxes = await prisma.developerSandbox.findMany({ where: { status: 'ACTIVE' }, include: { user: { select: { email: true } } }, orderBy: { createdAt: 'desc' }, take: 20 });
  if (sandboxes.length === 0) return <p className="admin-empty mt-4">No active sandboxes.</p>;
  return (
    <table className="admin-table mt-4">
      <thead><tr><th>Name</th><th>Owner</th><th>Used</th><th></th></tr></thead>
      <tbody>
        {sandboxes.map((sandbox) => (
          <tr key={sandbox.id}>
            <td>{sandbox.name}</td>
            <td className="text-xs text-slate-400">{sandbox.user.email}</td>
            <td className="text-xs">{sandbox.used}/{sandbox.quota}</td>
            <td className="text-right">
              <form action={disableSandboxAdminAction}>
                <input type="hidden" name="id" value={sandbox.id} />
                <button className="text-xs text-red-300 hover:text-red-200">Disable</button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
