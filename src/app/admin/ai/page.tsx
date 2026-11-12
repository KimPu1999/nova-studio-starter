import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminAiPage() {
  await requireAdmin();
  const [providers, jobs, usage] = await Promise.all([prisma.aiProvider.count({ where: { isEnabled: true } }), prisma.aiGenerationJob.count(), prisma.aiUsageRecord.aggregate({ _sum: { creditsConsumed: true }, where: { status: 'SUCCEEDED' } })]);
  return <main className="admin-content max-w-6xl"><p className="eyebrow">AI CONTROL CENTER</p><h1 className="admin-title">AI operations.</h1><p className="mt-2 text-sm text-slate-400">Providers are disabled by default. Configure and test an approved server-side adapter before enabling paid generation.</p><div className="admin-stat-grid mt-8"><Stat label="Enabled providers" value={providers}/><Stat label="Generation jobs" value={jobs}/><Stat label="Credits consumed" value={usage._sum.creditsConsumed ?? 0}/></div><section className="admin-panel mt-6"><h2 className="font-semibold">Safe starting points</h2><div className="mt-4 flex flex-wrap gap-3"><Link href="/ai/builder" className="btn-primary">Open builder</Link><Link href="/ai/templates" className="btn-ghost">View recommendations</Link></div></section></main>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="admin-stat"><p className="text-2xl font-bold">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>; }
