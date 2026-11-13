import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { apiLimits } from '@/lib/api-v1';

export const dynamic = 'force-dynamic';

export default async function AdminDevelopersPage() {
  await requireAdmin();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [apiKeys, serviceAccounts, apps, clients, endpoints, sandboxes, usageToday, rateLimitedToday, quotaPolicies, auditCount] = await Promise.all([
    prisma.apiCredential.count({ where: { revokedAt: null } }),
    prisma.serviceAccount.count({ where: { revokedAt: null } }),
    prisma.developerApplication.count(),
    prisma.oAuthClient.count(),
    prisma.webhookEndpoint.count({ where: { status: 'ACTIVE' } }),
    prisma.developerSandbox.count({ where: { status: 'ACTIVE' } }),
    prisma.apiUsageEvent.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.apiUsageEvent.count({ where: { createdAt: { gte: dayStart }, rateLimited: true } }),
    prisma.apiQuotaPolicy.count(),
    prisma.apiAuditLog.count(),
  ]);

  const stats = [
    { label: 'Active API keys', value: apiKeys },
    { label: 'Active service accounts', value: serviceAccounts },
    { label: 'Developer applications', value: apps },
    { label: 'OAuth clients', value: clients },
    { label: 'Active webhook endpoints', value: endpoints },
    { label: 'Active sandboxes', value: sandboxes },
    { label: 'API requests today', value: usageToday },
    { label: 'Rate-limited today', value: rateLimitedToday },
    { label: 'Workspace quota policies', value: quotaPolicies },
    { label: 'Developer audit entries', value: auditCount },
  ];

  return (
    <main className="admin-content max-w-6xl">
      <p className="eyebrow">DEVELOPER PLATFORM CONTROL CENTER</p>
      <h1 className="admin-title">Developer platform.</h1>
      <p className="mt-2 text-sm text-slate-400">Database-backed counts for the public API surface. Plaintext credentials, OAuth secrets and webhook signing secrets are never stored in readable form and cannot be displayed here.</p>

      <div className="admin-stat-grid mt-8">
        {stats.map((stat) => <div key={stat.label} className="admin-stat"><p className="mt-5 text-2xl font-bold">{stat.value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{stat.label}</p></div>)}
      </div>

      <div className="admin-stat-grid mt-4">
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{apiLimits.perCredentialPerMinute}</p><p className="mt-1 text-xs text-slate-500">Requests/min per credential</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{apiLimits.perUserPerMinute}</p><p className="mt-1 text-xs text-slate-500">Requests/min per user</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{apiLimits.monthlyQuotaDefault.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Default monthly quota</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{apiLimits.sandboxMonthlyQuota.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Sandbox monthly quota</p></div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/developers/apps" className="btn-outline">OAuth apps</Link>
        <Link href="/admin/developers/webhooks" className="btn-outline">Webhook health</Link>
        <Link href="/admin/developers/limits" className="btn-outline">Quota policies</Link>
        <Link href="/admin/developers/security" className="btn-outline">Credentials & audit</Link>
        <Link href="/developers" className="btn-outline">Developer portal</Link>
      </div>
    </main>
  );
}
