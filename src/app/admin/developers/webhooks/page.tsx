import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  DELIVERED: 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  PENDING: 'border border-amber-400/30 bg-amber-400/10 text-amber-200',
  RETRYING: 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  FAILED: 'border border-orange-400/30 bg-orange-400/10 text-orange-200',
  DEAD_LETTER: 'border border-red-400/30 bg-red-400/10 text-red-200',
};

export default async function AdminDeveloperWebhooksPage() {
  await requireAdmin();
  const [byStatus, endpoints, recentDeliveries, deadLetter] = await Promise.all([
    prisma.webhookDelivery.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.webhookEndpoint.findMany({ include: { workspace: { select: { name: true } }, _count: { select: { deliveries: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.webhookDelivery.findMany({ include: { endpoint: { select: { url: true, workspace: { select: { name: true } } } }, event: { select: { eventType: true, eventId: true } } }, orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.webhookDelivery.count({ where: { status: 'DEAD_LETTER' } }),
  ]);

  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count.id]));

  return (
    <main className="admin-content max-w-6xl">
      <p className="eyebrow">DEVELOPER PLATFORM</p>
      <h1 className="admin-title">Webhook health.</h1>
      <p className="mt-2 text-sm text-slate-400">Delivery queue state across all workspaces. The delivery engine runs on infrastructure; {deadLetter} dead-lettered delivery(ies) need workspace-owner attention or manual retry from the portal.</p>

      <div className="admin-stat-grid mt-8">
        {['DELIVERED', 'PENDING', 'RETRYING', 'FAILED', 'DEAD_LETTER'].map((status) => (
          <div key={status} className="admin-stat"><p className="mt-5 text-2xl font-bold">{(counts[status] ?? 0).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{status.replace('_', ' ').toLowerCase()}</p></div>
        ))}
      </div>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Endpoints</h2>
        {endpoints.length === 0 ? <p className="admin-empty mt-4">No webhook endpoints registered.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>URL</th><th>Workspace</th><th>Deliveries</th><th>Status</th></tr></thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td className="max-w-xs truncate font-mono text-xs">{endpoint.url}</td>
                  <td className="text-xs text-slate-400">{endpoint.workspace?.name ?? '—'}</td>
                  <td className="text-xs">{endpoint._count.deliveries}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${endpoint.status === 'ACTIVE' ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border border-red-400/30 bg-red-400/10 text-red-200'}`}>{endpoint.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-panel mt-6">
        <h2 className="font-semibold">Recent deliveries</h2>
        {recentDeliveries.length === 0 ? <p className="admin-empty mt-4">No deliveries yet.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>Event</th><th>Endpoint</th><th>Workspace</th><th>Attempts</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {recentDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="font-mono text-xs">{delivery.event.eventType}</td>
                  <td className="max-w-xs truncate font-mono text-xs">{delivery.endpoint.url}</td>
                  <td className="text-xs text-slate-400">{delivery.endpoint.workspace?.name ?? '—'}</td>
                  <td className="text-xs">{delivery.attemptCount}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[delivery.status] ?? 'border border-white/10 text-slate-300'}`}>{delivery.status}</span></td>
                  <td className="text-xs text-slate-500">{delivery.createdAt.toISOString().slice(0, 16).replace('T', ' ')}Z</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Link href="/admin/developers" className="btn-outline mt-8 inline-block">Back to overview</Link>
    </main>
  );
}
