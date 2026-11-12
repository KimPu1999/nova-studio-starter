import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AiBuilderPage() {
  const user = await requireUser();
  const projects = await prisma.aiWebsiteProject.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 50 });
  return <main className="admin-content max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">AI WEBSITE BUILDER</p><h1 className="admin-title">Build from a safe, editable structure.</h1><p className="mt-2 text-sm text-slate-400">Provider generation is disabled until configured. Your projects remain private and schema-validated.</p></div><Link href="/ai/builder/new" className="btn-primary"><Plus size={16}/> New project</Link></div><section className="mt-8 grid gap-4 md:grid-cols-2">{projects.map((project)=><Link key={project.id} href={`/ai/builder/${project.id}`} className="admin-panel transition hover:border-violet-400/40"><div className="flex items-center gap-3"><div className="admin-stat-icon admin-stat-accent"><Sparkles size={17}/></div><div><h2 className="font-semibold">{project.name}</h2><p className="text-xs text-slate-500">Updated {project.updatedAt.toLocaleDateString()}</p></div></div><p className="mt-4 line-clamp-2 text-sm text-slate-400">{project.description || 'No description yet.'}</p></Link>)}{projects.length === 0 && <div className="admin-empty md:col-span-2">No AI website projects yet.</div>}</section></main>;
}
