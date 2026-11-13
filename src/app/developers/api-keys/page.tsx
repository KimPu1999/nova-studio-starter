import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { apiScopes } from '@/lib/api-v1';
import { createApiKeyAction, revokeApiKeyAction } from '../actions';
import { CreationForm, ScopePicker } from '../create-form';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const user = await requireUser();
  const [keys, memberships] = await Promise.all([
    prisma.apiCredential.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { workspace: { select: { name: true } } },
    }),
    prisma.workspaceMember.findMany({ where: { userId: user.id }, select: { workspace: { select: { id: true, name: true } } } }),
  ]);

  return (
    <main className="admin-content max-w-5xl">
      <p className="eyebrow">API CREDENTIALS</p>
      <h1 className="admin-title">API keys</h1>
      <p className="mt-2 text-sm text-slate-400">Scoped keys for the NOVA API v1. Keys are stored as SHA-256 hashes — the plaintext is shown once at creation.</p>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Create a key</h2>
        <div className="mt-4">
          <CreationForm action={createApiKeyAction} submitLabel="Create API key" secretLabel="New API key">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="key-name" className="label">Key name</label>
                <input id="key-name" name="name" required maxLength={80} className="input" placeholder="e.g. CI pipeline" />
              </div>
              <div>
                <label htmlFor="key-expiry" className="label">Expires</label>
                <select id="key-expiry" name="expiresIn" className="input" defaultValue="90">
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days</option>
                  <option value="365">In 1 year</option>
                  <option value="never">Never</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="key-workspace" className="label">Workspace scope (optional)</label>
                <select id="key-workspace" name="workspaceId" className="input">
                  <option value="">Personal key (no workspace binding)</option>
                  {memberships.map((m) => <option key={m.workspace.id} value={m.workspace.id}>{m.workspace.name}</option>)}
                </select>
              </div>
            </div>
            <ScopePicker scopes={[...apiScopes]} />
          </CreationForm>
        </div>
      </section>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Your keys</h2>
        {keys.length === 0 ? (
          <p className="admin-empty mt-4">No API keys yet. Create one above to call the NOVA API.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Workspace</th><th>Expires</th><th>Last used</th><th>Status</th><th /></tr></thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td className="font-mono text-xs text-slate-400">{key.keyPrefix}…</td>
                    <td className="text-xs text-slate-400">{key.scopes.join(', ')}</td>
                    <td className="text-xs">{key.workspace?.name ?? '—'}</td>
                    <td className="text-xs">{key.expiresAt ? key.expiresAt.toLocaleDateString() : 'Never'}</td>
                    <td className="text-xs">{key.lastUsedAt ? key.lastUsedAt.toLocaleDateString() : 'Never used'}</td>
                    <td className="text-xs">{key.revokedAt ? <span className="text-red-300">Revoked</span> : key.expiresAt && key.expiresAt < new Date() ? <span className="text-amber-300">Expired</span> : <span className="text-emerald-300">Active</span>}</td>
                    <td>{!key.revokedAt && <form action={revokeApiKeyAction}><input type="hidden" name="id" value={key.id} /><button className="text-xs text-red-300 hover:underline">Revoke</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
