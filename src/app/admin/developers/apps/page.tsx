import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminDeveloperAppsPage() {
  await requireAdmin();
  const [apps, activeTokens, pendingAuthorizations] = await Promise.all([
    prisma.developerApplication.findMany({
      include: { user: { select: { email: true } }, workspace: { select: { name: true } }, clients: { select: { clientId: true, status: true, clientType: true, redirectUris: true, scopes: true, _count: { select: { tokens: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.oAuthTokenRecord.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.oAuthAuthorization.count({ where: { consumedAt: null, expiresAt: { gt: new Date() } } }),
  ]);

  return (
    <main className="admin-content max-w-6xl">
      <p className="eyebrow">DEVELOPER PLATFORM</p>
      <h1 className="admin-title">OAuth applications.</h1>
      <p className="mt-2 text-sm text-slate-400">All registered applications and their clients. Client secrets are stored hashed and can never be displayed. {activeTokens} live access token(s), {pendingAuthorizations} unexchanged authorization code(s).</p>

      {apps.length === 0 ? <p className="admin-empty mt-8">No developer applications registered yet.</p> : (
        <section className="admin-panel mt-8">
          <table className="admin-table">
            <thead><tr><th>Application</th><th>Owner</th><th>Workspace</th><th>Client ID(s)</th><th>Type</th><th>Tokens</th><th>Status</th></tr></thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id}>
                  <td>{app.name}</td>
                  <td className="text-xs text-slate-400">{app.user.email}</td>
                  <td className="text-xs text-slate-400">{app.workspace?.name ?? '—'}</td>
                  <td className="font-mono text-xs">{app.clients.map((c) => c.clientId).join(', ') || '—'}</td>
                  <td className="text-xs text-slate-400">{app.clients.map((c) => c.clientType).join(', ') || '—'}</td>
                  <td className="text-xs">{app.clients.reduce((n, c) => n + c._count.tokens, 0)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${app.status === 'ACTIVE' ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border border-red-400/30 bg-red-400/10 text-red-200'}`}>{app.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Link href="/admin/developers" className="btn-outline mt-8 inline-block">Back to overview</Link>
    </main>
  );
}
