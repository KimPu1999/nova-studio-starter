import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { webhookEventTypes } from '@/lib/webhooks/events';
import { createWebhookEndpointAction, disableWebhookEndpointAction } from '../actions';
import { CreationForm } from '../create-form';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const user = await requireUser();
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { workspace: { members: { some: { userId: user.id } } } },
    orderBy: { createdAt: 'desc' },
    include: {
      workspace: { select: { name: true } },
      subscriptions: true,
      _count: { select: { deliveries: true } },
    },
  });
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, role: { in: ['OWNER', 'ADMIN', 'MANAGER'] } },
    select: { workspace: { select: { id: true, name: true } } },
  });

  return (
    <main className="admin-content max-w-5xl">
      <p className="eyebrow">WEBHOOK ENDPOINTS</p>
      <h1 className="admin-title">Webhooks</h1>
      <p className="mt-2 text-sm text-slate-400">Durable, signed event deliveries with retries and dead-letter state. Signing secrets are encrypted at rest and shown once.</p>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Add an endpoint</h2>
        <div className="mt-4">
          <CreationForm action={createWebhookEndpointAction} submitLabel="Create endpoint" secretLabel="Signing secret" secretHref="/developers/webhooks">
            <div className="grid gap-4">
              <div>
                <label htmlFor="wh-workspace" className="label">Workspace</label>
                <select id="wh-workspace" name="workspaceId" required className="input">
                  {memberships.length === 0 && <option value="">You need OWNER/ADMIN/MANAGER membership in a workspace</option>}
                  {memberships.map((m) => <option key={m.workspace.id} value={m.workspace.id}>{m.workspace.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="wh-url" className="label">Endpoint URL (HTTPS, ports 443/8443, no private addresses)</label>
                <input id="wh-url" name="url" required className="input font-mono text-xs" placeholder="https://api.example.com/hooks/nova" />
              </div>
              <fieldset className="space-y-2">
                <legend className="label">Events</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {webhookEventTypes.map((event) => (
                    <label key={event} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
                      <input type="checkbox" name="events" value={event} className="accent-violet-500" />
                      <span className="font-mono text-xs text-cyan-200">{event}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </CreationForm>
        </div>
      </section>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Endpoints</h2>
        {endpoints.length === 0 ? (
          <p className="admin-empty mt-4">No webhook endpoints yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-cyan-200">{endpoint.url}</p>
                  <p className="mt-1 text-xs text-slate-500">{endpoint.workspace.name} · {endpoint.subscriptions.filter((s) => s.isActive).length} event types · {endpoint._count.deliveries} deliveries</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs ${endpoint.status === 'ACTIVE' ? 'bg-emerald-400/10 text-emerald-300' : endpoint.status === 'DISABLED' ? 'bg-amber-400/10 text-amber-300' : 'bg-red-400/10 text-red-300'}`}>{endpoint.status}</span>
                  <Link href={`/developers/webhooks/${endpoint.id}`} className="text-xs text-violet-300 hover:underline">Open</Link>
                  {endpoint.status === 'ACTIVE' && (
                    <form action={disableWebhookEndpointAction}>
                      <input type="hidden" name="id" value={endpoint.id} />
                      <button className="text-xs text-red-300 hover:underline">Disable</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
