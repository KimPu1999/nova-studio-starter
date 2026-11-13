import crypto from 'node:crypto';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser, csrfCheck } from '@/lib/auth';
import { encryptSecret } from '@/lib/security/secrets';
import { prismaAudit } from '@/lib/api/audit';
import { retryDeliveryAction } from '../../actions';
import { RotateSecretForm } from '../rotate-form';

export const dynamic = 'force-dynamic';

const statusStyles: Record<string, string> = {
  DELIVERED: 'bg-emerald-400/10 text-emerald-300',
  PENDING: 'bg-white/10 text-slate-300',
  RETRYING: 'bg-amber-400/10 text-amber-300',
  FAILED: 'bg-orange-400/10 text-orange-300',
  DEAD_LETTER: 'bg-red-400/10 text-red-300',
};

export default async function WebhookEndpointPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id, workspace: { members: { some: { userId: user.id } } } },
    include: {
      workspace: { select: { name: true } },
      subscriptions: true,
      deliveries: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { event: { select: { eventId: true, eventType: true, version: true, createdAt: true, payload: true } }, attempts: { orderBy: { attemptNumber: 'desc' } } },
      },
      secrets: { where: { revokedAt: null }, orderBy: { version: 'desc' } },
    },
  });
  if (!endpoint) {
    return <main className="admin-content max-w-3xl"><p className="admin-empty">Endpoint not found.</p><Link href="/developers/webhooks" className="btn-outline mt-4 inline-block">Back</Link></main>;
  }

  const stats = {
    delivered: endpoint.deliveries.filter((d) => d.status === 'DELIVERED').length,
    retrying: endpoint.deliveries.filter((d) => d.status === 'RETRYING' || d.status === 'PENDING').length,
    dead: endpoint.deliveries.filter((d) => d.status === 'DEAD_LETTER' || d.status === 'FAILED').length,
  };

  return (
    <main className="admin-content max-w-5xl">
      <p className="eyebrow">WEBHOOK ENDPOINT</p>
      <h1 className="admin-title break-all font-mono text-xl">{endpoint.url}</h1>
      <p className="mt-2 text-sm text-slate-400">{endpoint.workspace.name} · {endpoint.subscriptions.filter((s) => s.isActive).map((s) => s.eventType).join(', ')}</p>

      <div className="admin-stat-grid mt-6">
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-emerald-300">{stats.delivered}</p><p className="mt-1 text-xs text-slate-500">Delivered (recent)</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-amber-300">{stats.retrying}</p><p className="mt-1 text-xs text-slate-500">Pending / retrying</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-red-300">{stats.dead}</p><p className="mt-1 text-xs text-slate-500">Dead-lettered</p></div>
      </div>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Signing secret</h2>
        <p className="mt-2 text-xs text-slate-500">Active version: v{endpoint.secrets[0]?.version ?? '—'} (encrypted at rest). Headers: <span className="font-mono">nova-signature</span>, <span className="font-mono">nova-timestamp</span>, <span className="font-mono">nova-event-id</span>, <span className="font-mono">nova-event-type</span>.</p>
        <div className="mt-4">
          {endpoint.status === 'ACTIVE' && (
            <RotateSecretForm
              endpointId={endpoint.id}
              action={async (formData) => {
                'use server';
                const user = await requireUser();
                await csrfCheck();
                const id = String(formData.get('id') || '');
                const target = await prisma.webhookEndpoint.findFirst({ where: { id, workspace: { members: { some: { userId: user.id } } } } });
                if (!target) return { ok: false, error: 'Endpoint not found.' };
                const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
                const latest = await prisma.webhookSigningSecret.findFirst({ where: { endpointId: id, revokedAt: null }, orderBy: { version: 'desc' } });
                const nextVersion = (latest?.version ?? 0) + 1;
                await prisma.$transaction([
                  prisma.webhookSigningSecret.updateMany({ where: { endpointId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
                  prisma.webhookSigningSecret.create({ data: { endpointId: id, secretCiphertext: encryptSecret(secret), version: nextVersion } }),
                ]);
                await prismaAudit({ userId: user.id, workspaceId: target.workspaceId, action: 'webhook.secret.rotate', metadata: { webhookEndpointId: id, version: nextVersion } });
                return { ok: true, secretOnce: secret };
              }}
            />
          )}
        </div>
      </section>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Delivery timeline</h2>
        {endpoint.deliveries.length === 0 ? (
          <p className="admin-empty mt-4">No deliveries yet. Events will appear here as they are dispatched.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {endpoint.deliveries.map((delivery) => (
              <li key={delivery.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm text-cyan-200">{delivery.event.eventType}</p>
                    <p className="text-xs text-slate-500">{delivery.event.eventId} · {delivery.event.createdAt.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs ${statusStyles[delivery.status] ?? ''}`}>{delivery.status}</span>
                    {(delivery.status === 'DEAD_LETTER' || delivery.status === 'FAILED') && (
                      <form action={retryDeliveryAction}>
                        <input type="hidden" name="id" value={delivery.id} />
                        <button className="text-xs text-violet-300 hover:underline">Retry</button>
                      </form>
                    )}
                  </div>
                </div>
                {delivery.attempts.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-500">
                    {delivery.attempts.map((attempt) => (
                      <li key={attempt.id}>
                        Attempt {attempt.attemptNumber} · {attempt.createdAt.toLocaleString()} · {attempt.ok ? <span className="text-emerald-300">HTTP {attempt.statusCode}</span> : <span className="text-red-300">{attempt.statusCode ? `HTTP ${attempt.statusCode}` : attempt.errorKind || 'failed'}</span>}{attempt.durationMs != null ? ` · ${attempt.durationMs}ms` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {delivery.nextAttemptAt && delivery.status === 'RETRYING' && <p className="mt-2 text-xs text-amber-300">Next attempt: {delivery.nextAttemptAt.toLocaleString()}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link href="/developers/webhooks" className="btn-outline mt-8 inline-block">All endpoints</Link>
    </main>
  );
}
