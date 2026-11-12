import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminHosting() {
  await requireAdmin();
  const [sites, active, failed, domains, plans] = await Promise.all([
    prisma.hostedWebsite.count({ where: { deletedAt: null } }),
    prisma.hostedWebsite.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
    prisma.websiteDeployment.count({ where: { status: 'FAILED' } }),
    prisma.websiteDomain.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.websiteHostingPlan.count({ where: { isActive: true } }),
  ]);
  return <main className="admin-content max-w-6xl"><p className="eyebrow">HOSTING CONTROL CENTER</p><h1 className="admin-title">Hosting operations.</h1><p className="mt-2 text-sm text-slate-400">Infrastructure integrations are intentionally inactive until a provider and worker are configured.</p><div className="admin-stat-grid mt-8"><Stat label="Hosted websites" value={sites}/><Stat label="Published sites" value={active}/><Stat label="Failed deployments" value={failed}/><Stat label="Verification queue" value={domains}/><Stat label="Active plans" value={plans}/></div><section className="admin-panel mt-6"><h2 className="font-semibold">Next configuration steps</h2><div className="mt-4 flex flex-wrap gap-3"><Link href="/admin/hosting/plans" className="btn-outline">Hosting plans</Link><Link href="/admin/hosting/domains" className="btn-outline">Domains</Link><Link href="/admin/hosting/deployments" className="btn-outline">Deployments</Link></div></section></main>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="admin-stat"><p className="text-2xl font-bold">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>; }
