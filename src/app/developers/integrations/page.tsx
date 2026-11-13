import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { disconnectIntegrationAction } from '../actions';

export const dynamic = 'force-dynamic';

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  google: 'Google',
  stripe: 'Stripe',
  openai: 'OpenAI',
};

export default async function IntegrationsPage() {
  const user = await requireUser();
  const [tokens, connections] = await Promise.all([
    prisma.oAuthTokenRecord.findMany({
      where: { userId: user.id, revokedAt: null },
      select: { id: true, createdAt: true, expiresAt: true, workspaceId: true, client: { select: { application: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.integrationConnection.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);

  const rows = [
    ...tokens.map((t) => ({ id: t.id, kind: 'OAuth grant' as const, name: t.client.application.name, detail: t.workspaceId ? 'Workspace-scoped access token' : 'User-scoped access token', status: 'ACTIVE', created: t.createdAt })),
    ...connections.map((c) => ({ id: c.id, kind: 'Provider link' as const, name: PROVIDER_LABELS[c.provider] ?? c.provider, detail: (c.scopes || []).join(', ') || 'No scopes recorded', status: c.status, created: c.createdAt })),
  ];

  return (
    <main className="admin-content max-w-4xl">
      <p className="eyebrow">INTEGRATIONS</p>
      <h1 className="admin-title">Connected integrations.</h1>
      <p className="mt-2 text-sm text-slate-400">Every live grant that lets external software act on your behalf. Disconnecting revokes the token immediately — the integration must re-run authorization to regain access. Revocation is permanent and cannot be undone from here.</p>

      {rows.length === 0 ? <p className="admin-empty mt-8">No live integrations. OAuth grants appear here after you approve an application; provider links appear after you connect one.</p> : (
        <section className="admin-panel mt-8">
          <table className="admin-table">
            <thead><tr><th>Integration</th><th>Type</th><th>Detail</th><th>Status</th><th>Granted</th><th></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td>{row.name}</td>
                  <td className="text-xs text-slate-400">{row.kind}</td>
                  <td className="text-xs text-slate-500">{row.detail}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${row.status === 'ACTIVE' ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border border-red-400/30 bg-red-400/10 text-red-200'}`}>{row.status}</span></td>
                  <td className="text-xs text-slate-500">{row.created.toISOString().slice(0, 10)}</td>
                  <td className="text-right">
                    {row.status === 'ACTIVE' ? (
                      <form action={disconnectIntegrationAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="text-xs text-red-300 hover:text-red-200">Disconnect</button>
                      </form>
                    ) : <span className="text-xs text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/developers/apps" className="btn-outline">Your OAuth apps</Link>
        <Link href="/developers/api-keys" className="btn-outline">API keys</Link>
        <Link href="/developers/sandbox" className="btn-outline">Sandbox console</Link>
      </div>
    </main>
  );
}
