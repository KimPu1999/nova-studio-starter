import Link from 'next/link';
import { notFound } from 'next/navigation';
import crypto from 'node:crypto';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { queueDeployment } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function HostedWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const site = await prisma.hostedWebsite.findFirst({ where: { id, userId: user.id, deletedAt: null }, include: { project: true, domains: true, deployments: { orderBy: { number: 'desc' }, take: 10 }, subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 } } });
  if (!site) notFound();
  return <main className="admin-content max-w-6xl"><Link href="/hosting" className="text-sm text-slate-400">← My websites</Link><div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">HOSTED WEBSITE</p><h1 className="admin-title">{site.name}</h1><p className="mt-2 text-sm text-slate-400">{site.slug} · {site.status}</p></div><form action={queueDeployment}><input type="hidden" name="websiteId" value={site.id}/><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()}/><button className="btn-primary">Queue deployment</button></form></div><div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]"><section className="admin-panel"><h2 className="font-semibold">Deployment history</h2><div className="mt-5 space-y-3">{site.deployments.map((deployment)=><div key={deployment.id} className="flex items-center justify-between border-b border-white/10 pb-3 text-sm"><span>Deployment #{deployment.number}</span><span className="text-xs text-violet-300">{deployment.status}</span></div>)}{!site.deployments.length && <p className="text-sm text-slate-500">No deployments yet.</p>}</div></section><aside className="admin-panel"><h2 className="font-semibold">Domains & plan</h2><p className="mt-4 text-sm text-slate-400">{site.domains.length ? site.domains.map((domain)=><span className="mr-2 inline-block" key={domain.id}>{domain.hostname} · {domain.status}</span>) : 'No verified domains configured.'}</p><p className="mt-4 text-sm text-slate-400">Plan: {site.subscriptions[0]?.plan.name || 'No active hosting plan'}</p><p className="mt-4 text-xs leading-5 text-slate-500">Deployments are queued only. A durable worker and approved hosting provider are required before public activation.</p></aside></div></main>;
}
