import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { apiLimits } from '@/lib/api-v1';
import { rateLimitPeek } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

function monthBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

function isoDateOrNull(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const from = isoDateOrNull(typeof params.from === 'string' ? params.from : undefined) ?? monthBounds().start;
  const to = isoDateOrNull(typeof params.to === 'string' ? params.to : undefined) ?? monthBounds().end;
  const { start: monthStart } = monthBounds();

  const [totals, byStatus, byEndpoint, byCredential, monthlyUsed] = await Promise.all([
    prisma.apiUsageEvent.aggregate({
      where: { userId: user.id, createdAt: { gte: from, lt: to } },
      _count: { id: true },
      _avg: { latencyMs: true },
    }),
    prisma.apiUsageEvent.groupBy({
      by: ['statusCode'],
      where: { userId: user.id, createdAt: { gte: from, lt: to } },
      _count: { id: true },
    }),
    prisma.apiUsageEvent.groupBy({
      by: ['endpoint'],
      where: { userId: user.id, createdAt: { gte: from, lt: to } },
      _count: { id: true },
      _avg: { latencyMs: true },
      orderBy: { _count: { endpoint: 'desc' } },
      take: 10,
    }),
    prisma.apiUsageEvent.groupBy({
      by: ['credentialId'],
      where: { userId: user.id, createdAt: { gte: from, lt: to } },
      _count: { id: true },
      orderBy: { _count: { credentialId: 'desc' } },
      take: 10,
    }),
    rateLimitPeek('quota', `user:${user.id}`, monthStart).catch(() => 0),
  ]);

  const total = totals._count.id;
  const ok = byStatus.filter((s) => s.statusCode < 400).reduce((n, s) => n + s._count.id, 0);
  const rateLimited = byStatus.filter((s) => s.statusCode === 429).reduce((n, s) => n + s._count.id, 0);
  const failed = total - ok;
  const errorRate = total > 0 ? Math.round((failed / total) * 1000) / 10 : 0;
  const credentials = byCredential.length ? await prisma.apiCredential.findMany({ where: { id: { in: byCredential.map((c) => c.credentialId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }) : [];
  const credentialNames = new Map(credentials.map((c) => [c.id, c.name]));

  const quota = apiLimits.monthlyQuotaDefault;
  const quotaPct = Math.min(100, Math.round((monthlyUsed / quota) * 100));

  return (
    <main className="admin-content max-w-5xl">
      <p className="eyebrow">API USAGE ANALYTICS</p>
      <h1 className="admin-title">Usage</h1>
      <p className="mt-2 text-sm text-slate-400">Real request telemetry from <span className="font-mono text-xs">ApiUsageEvent</span>. Aggregation window: {from.toISOString().slice(0, 10)} → {to.toISOString().slice(0, 10)} (UTC). Request bodies are never recorded.</p>

      <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
        <div><label htmlFor="u-from" className="label">From</label><input id="u-from" name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} className="input" /></div>
        <div><label htmlFor="u-to" className="label">To</label><input id="u-to" name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} className="input" /></div>
        <button className="btn-outline">Apply</button>
      </form>

      <div className="admin-stat-grid mt-8">
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{total}</p><p className="mt-1 text-xs text-slate-500">Total requests</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-emerald-300">{ok}</p><p className="mt-1 text-xs text-slate-500">Successful (2xx/3xx)</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-red-300">{failed}</p><p className="mt-1 text-xs text-slate-500">Failed (4xx/5xx)</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{errorRate}%</p><p className="mt-1 text-xs text-slate-500">Error rate</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold">{Math.round(totals._avg.latencyMs ?? 0)} ms</p><p className="mt-1 text-xs text-slate-500">Avg latency</p></div>
        <div className="admin-stat"><p className="mt-5 text-2xl font-bold text-amber-300">{rateLimited}</p><p className="mt-1 text-xs text-slate-500">Rate-limited (429)</p></div>
      </div>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Monthly quota</h2>
        <p className="mt-2 text-xs text-slate-500">{monthlyUsed} / {quota} requests consumed this calendar month (all credentials combined; workspace quotas are shared across keys).</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${quotaPct > 80 ? 'bg-red-400' : 'bg-violet-400'}`} style={{ width: `${quotaPct}%` }} />
        </div>
      </section>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">By endpoint</h2>
        {byEndpoint.length === 0 ? <p className="admin-empty mt-4">No requests in this window.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>Endpoint</th><th>Requests</th><th>Avg latency</th></tr></thead>
            <tbody>{byEndpoint.map((row) => (
              <tr key={row.endpoint}><td className="font-mono text-xs">{row.endpoint}</td><td>{row._count.id}</td><td className="text-xs">{Math.round(row._avg.latencyMs ?? 0)} ms</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">By credential</h2>
        {byCredential.length === 0 ? <p className="admin-empty mt-4">No requests in this window.</p> : (
          <table className="admin-table mt-4">
            <thead><tr><th>Credential</th><th>Requests</th></tr></thead>
            <tbody>{byCredential.map((row) => (
              <tr key={row.credentialId ?? 'unknown'}><td>{row.credentialId ? credentialNames.get(row.credentialId) ?? 'Unknown credential' : 'Unknown'}</td><td>{row._count.id}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <Link href="/developers/docs#rate-limits" className="btn-outline mt-8 inline-block">Limits & quotas reference</Link>
    </main>
  );
}
