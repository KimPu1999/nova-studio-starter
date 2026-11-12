import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createHostedWebsite } from '../../actions';

export default async function NewHostedWebsite() {
  const user = await requireUser();
  const projects = await prisma.aiWebsiteProject.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true } });
  return <main className="admin-content max-w-3xl"><p className="eyebrow">NEW HOSTED WEBSITE</p><h1 className="admin-title">Choose a validated project.</h1><form action={createHostedWebsite} className="admin-panel mt-8 space-y-5"><label className="block text-sm text-slate-300">Website project<select name="projectId" className="admin-input mt-2" required>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="block text-sm text-slate-300">Website name<input name="name" className="admin-input mt-2" required maxLength={120}/></label><label className="block text-sm text-slate-300">Platform slug<input name="slug" className="admin-input mt-2" required pattern="[a-z0-9-]{3,50}" placeholder="my-studio"/><span className="mt-1 block text-xs text-slate-500">Used for a future configured platform subdomain.</span></label><div className="flex gap-3"><button className="btn-primary">Create site</button><Link href="/hosting" className="btn-ghost">Cancel</Link></div></form></main>;
}
