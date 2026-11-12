import Link from 'next/link';
import { Globe2, Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function HostingPage() {
  const user = await requireUser();
  const sites = await prisma.hostedWebsite.findMany({ where: { userId: user.id, deletedAt: null }, include: { domains: { where: { isPrimary: true }, take: 1 }, activeDeployment: true }, orderBy: { updatedAt: 'desc' }, take: 50 });
  return <main className="admin-content max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">HOSTING</p><h1 className="admin-title">Your websites.</h1><p className="mt-2 text-sm text-slate-400">Publish validated component websites without running customer code.</p></div><Link href="/hosting/sites/new" className="btn-primary"><Plus size={16}/> Add website</Link></div><section className="mt-8 grid gap-4 md:grid-cols-2">{sites.map((site)=><Link href={`/hosting/sites/${site.id}`} key={site.id} className="admin-panel transition hover:border-violet-400/40"><div className="flex items-center gap-3"><div className="admin-stat-icon admin-stat-accent"><Globe2 size={17}/></div><div><h2 className="font-semibold">{site.name}</h2><p className="text-xs text-slate-500">{site.domains[0]?.hostname || `${site.slug} (subdomain pending)`}</p></div><span className="ml-auto rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-slate-400">{site.status}</span></div></Link>)}{!sites.length && <div className="admin-empty md:col-span-2">No hosted websites yet.</div>}</section></main>;
}
