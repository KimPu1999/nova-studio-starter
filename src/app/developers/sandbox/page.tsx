import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { webhookEventTypes } from '@/lib/webhooks/events';
import { createSandboxAction, disableSandboxAction, simulateSandboxEventFormAction } from '../actions';
import { CreationForm } from '../create-form';

export const dynamic = 'force-dynamic';

export default async function SandboxPage() {
  const user = await requireUser();
  const sandboxes = await prisma.developerSandbox.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { workspace: { select: { name: true } } },
  });
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id }, select: { workspace: { select: { id: true, name: true } } } });

  return (
    <main className="admin-content max-w-5xl">
      <p className="eyebrow">DEVELOPER SANDBOX</p>
      <h1 className="admin-title">Sandbox</h1>
      <p className="mt-2 text-sm text-slate-400">Isolated test environment. Sandbox keys (<span className="font-mono">nova_sb_…</span>) only call <span className="font-mono">/api/v1/sandbox</span> endpoints, carry separate quotas, and simulated events are clearly labelled — they never touch production records or entitlements.</p>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Create a sandbox</h2>
        <div className="mt-4">
          <CreationForm action={createSandboxAction} submitLabel="Create sandbox" secretLabel="Sandbox key">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sb-name" className="label">Sandbox name</label>
                <input id="sb-name" name="name" maxLength={80} className="input" placeholder="Testing playground" />
              </div>
              <div>
                <label htmlFor="sb-workspace" className="label">Workspace (optional — required to simulate deliveries)</label>
                <select id="sb-workspace" name="workspaceId" className="input">
                  <option value="">Not linked</option>
                  {memberships.map((m) => <option key={m.workspace.id} value={m.workspace.id}>{m.workspace.name}</option>)}
                </select>
              </div>
            </div>
          </CreationForm>
        </div>
      </section>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Your sandboxes</h2>
        {sandboxes.length === 0 ? (
          <p className="admin-empty mt-4">No sandboxes yet.</p>
        ) : (
          <div className="mt-4 space-y-5">
            {sandboxes.map((sandbox) => {
              const usagePct = sandbox.quota > 0 ? Math.min(100, Math.round((sandbox.used / sandbox.quota) * 100)) : 0;
              return (
                <div key={sandbox.id} className="rounded-xl border border-white/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{sandbox.name} <span className="font-mono text-xs text-slate-500">{sandbox.keyPrefix}…</span></p>
                      <p className="text-xs text-slate-500">{sandbox.workspace?.name ?? 'Not workspace-linked'} · quota {sandbox.used}/{sandbox.quota} requests/month</p>
                    </div>
                    {sandbox.status === 'ACTIVE' && (
                      <form action={disableSandboxAction}>
                        <input type="hidden" name="id" value={sandbox.id} />
                        <button className="text-xs text-red-300 hover:underline">Disable</button>
                      </form>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${usagePct}%` }} />
                  </div>
                  {sandbox.status === 'ACTIVE' && sandbox.workspaceId && (
                    <form action={simulateSandboxEventFormAction} className="mt-4 flex flex-wrap items-center gap-3">
                      <input type="hidden" name="sandboxId" value={sandbox.id} />
                      <label htmlFor={`evt-${sandbox.id}`} className="text-xs text-slate-400">Simulate event:</label>
                      <select id={`evt-${sandbox.id}`} name="eventType" className="input max-w-xs text-xs">
                        {webhookEventTypes.map((event) => <option key={event} value={event}>{event}</option>)}
                      </select>
                      <button className="btn-outline text-xs">Dispatch simulated event</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
