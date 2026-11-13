import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { apiLimits } from '@/lib/api-v1';
import { rateLimitPeek } from '@/lib/api/rate-limit';
import { upsertQuotaPolicyAction, deleteQuotaPolicyAction } from '../actions';

export const dynamic = 'force-dynamic';

function monthBounds(date = new Date()) {
  return { start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)) };
}

export default async function AdminDeveloperLimitsPage() {
  await requireAdmin();
  const monthStart = monthBounds().start;
  const [policies, workspaces, topUsers] = await Promise.all([
    prisma.apiQuotaPolicy.findMany({ include: { workspace: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: 50 }),
    prisma.workspace.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.apiUsageEvent.groupBy({ by: ['userId'], where: { createdAt: { gte: monthStart }, userId: { not: null } }, _count: { id: true }, orderBy: { _count: { userId: 'desc' } }, take: 10 }),
  ]);

  const monthlyUsed = await Promise.all(topUsers.map((row) => rateLimitPeek('quota', `user:${row.userId}`, monthStart).catch(() => 0)));
  const userNames = await prisma.user.findMany({ where: { id: { in: topUsers.map((r) => r.userId).filter((x): x is string => Boolean(x)) } }, select: { id: true, email: true } });
  const nameById = new Map(userNames.map((u) => [u.id, u.email]));
  const policyByWorkspace = new Map(policies.map((p) => [p.workspaceId, p]));

  return (
    <main className="admin-content max-w-6xl">
      <p className="eyebrow">DEVELOPER PLATFORM</p>
      <h1 className="admin-title">Quota policies.</h1>
      <p className="mt-2 text-sm text-slate-400">Per-workspace overrides of the platform defaults ({apiLimits.perCredentialPerMinute}/min per credential, {apiLimits.monthlyQuotaDefault.toLocaleString()}/month). Workspaces without a policy use the defaults. Quotas are enforced atomically in Postgres and shared across all of a workspace&apos;s credentials, so key rotation cannot bypass them.</p>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Set or update a policy</h2>
        <form action={upsertQuotaPolicyAction} className="mt-4 flex flex-wrap items-end gap-3">
          <div><label htmlFor="qp-ws" className="label">Workspace</label><select id="qp-ws" name="workspaceId" className="input min-w-64">{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div>
          <div><label htmlFor="qp-rpm" className="label">Requests / minute</label><input id="qp-rpm" name="requestsPerMinute" type="number" min={5} max={600} defaultValue={120} className="input" /></div>
          <div><label htmlFor="qp-monthly" className="label">Monthly requests</label><input id="qp-monthly" name="monthlyRequests" type="number" min={100} max={2000000} defaultValue={100000} className="input" /></div>
          <button className="btn-primary">Save policy</button>
        </form>
      </section>

      <section className="admin-panel mt-6">
        <h2 className="font-semibold">Active policies</h2>
        {policies.length === 0 ? <p className="admin-empty mt-4">No overrides — every workspace uses platform defaults.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>Workspace</th><th>Requests/min</th><th>Monthly</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td>{policy.workspace.name}</td>
                  <td className="text-xs">{policy.requestsPerMinute}</td>
                  <td className="text-xs">{policy.monthlyRequests.toLocaleString()}</td>
                  <td className="text-xs text-slate-500">{policy.updatedAt.toISOString().slice(0, 10)}</td>
                  <td className="text-right"><form action={deleteQuotaPolicyAction}><input type="hidden" name="workspaceId" value={policy.workspaceId} /><button className="text-xs text-red-300 hover:text-red-200">Delete</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-panel mt-6">
        <h2 className="font-semibold">Top consumers this month</h2>
        {topUsers.length === 0 ? <p className="admin-empty mt-4">No API usage recorded yet this month.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>User</th><th>Recorded requests</th><th>Quota counter</th></tr></thead>
            <tbody>
              {topUsers.map((row, index) => (
                <tr key={row.userId ?? index}>
                  <td className="text-xs">{row.userId ? nameById.get(row.userId) ?? 'Unknown user' : 'Unknown'}</td>
                  <td className="text-xs">{row._count.id}</td>
                  <td className="text-xs text-slate-500">{(monthlyUsed[index] ?? 0).toLocaleString()} / {apiLimits.monthlyQuotaDefault.toLocaleString()}</td>
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
