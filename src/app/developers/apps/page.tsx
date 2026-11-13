import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { apiScopes } from '@/lib/api-v1';
import { createOAuthAppAction, revokeOAuthAppAction } from '../actions';
import { CreationForm, ScopePicker } from '../create-form';

export const dynamic = 'force-dynamic';

export default async function AppsPage() {
  const user = await requireUser();
  const apps = await prisma.developerApplication.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { clients: { include: { _count: { select: { authorizations: true, tokens: { where: { revokedAt: null } } } } } } },
  });

  return (
    <main className="admin-content max-w-5xl">
      <p className="eyebrow">OAUTH 2.0 APPLICATIONS</p>
      <h1 className="admin-title">OAuth apps</h1>
      <p className="mt-2 text-sm text-slate-400">Applications that request user consent via the Authorization Code flow with PKCE. Confidential clients receive a client secret; public clients (SPAs, CLIs) do not.</p>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Register an application</h2>
        <div className="mt-4">
          <CreationForm action={createOAuthAppAction} submitLabel="Register application" secretLabel="Client credentials">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="app-name" className="label">Application name</label>
                <input id="app-name" name="name" required maxLength={80} className="input" placeholder="e.g. Acme Dashboard" />
              </div>
              <div>
                <label htmlFor="app-type" className="label">Application type</label>
                <select id="app-type" name="clientType" className="input">
                  <option value="PUBLIC">Public (SPA / CLI — PKCE required)</option>
                  <option value="CONFIDENTIAL">Confidential (server-side)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="app-redirects" className="label">Redirect URIs (one per line, HTTPS, exact match)</label>
                <textarea id="app-redirects" name="redirectUris" required rows={3} className="input font-mono text-xs" placeholder={'https://app.example.com/callback'} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="app-desc" className="label">Description (optional)</label>
                <input id="app-desc" name="description" maxLength={300} className="input" />
              </div>
            </div>
            <ScopePicker scopes={[...apiScopes]} />
          </CreationForm>
        </div>
      </section>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Your applications</h2>
        {apps.length === 0 ? (
          <p className="admin-empty mt-4">No applications registered yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {apps.map((app) => (
              <div key={app.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{app.name}</p>
                    {app.description && <p className="text-xs text-slate-500">{app.description}</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${app.status === 'ACTIVE' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{app.status}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                  {app.clients.map((client) => (
                    <p key={client.id}><span className="text-slate-500">client_id</span> <span className="font-mono text-cyan-200">{client.clientId}</span> · {client.clientType} · {client._count.tokens} active token{client._count.tokens === 1 ? '' : 's'}</p>
                  ))}
                </div>
                {app.status === 'ACTIVE' && (
                  <form action={revokeOAuthAppAction} className="mt-3">
                    <input type="hidden" name="id" value={app.id} />
                    <button className="text-xs text-red-300 hover:underline">Revoke application & tokens</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
