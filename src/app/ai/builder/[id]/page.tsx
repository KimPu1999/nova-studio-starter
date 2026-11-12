import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { websiteSchema } from '@/lib/ai/schema';

export const dynamic = 'force-dynamic';

export default async function AiWebsiteProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await prisma.aiWebsiteProject.findFirst({ where: { id, userId: user.id }, include: { revisions: { orderBy: { version: 'desc' }, take: 10 } } });
  if (!project) notFound();
  const definition = websiteSchema.safeParse(project.schema);
  if (!definition.success) notFound();
  return <main className="admin-content max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">PRIVATE AI PROJECT</p><h1 className="admin-title">{project.name}</h1><p className="mt-2 text-sm text-slate-400">Validated schema v{project.schemaVersion}. No generated code is executed.</p></div><Link href="/ai/builder" className="btn-ghost">Back to projects</Link></div><div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]"><section className="admin-panel"><h2 className="font-semibold">{definition.data.pages[0]?.title}</h2><p className="mt-3 text-sm text-slate-400">{definition.data.metadata.description}</p><div className="mt-6 rounded-xl border border-violet-400/20 bg-[#09090F] p-6"><p className="text-xs uppercase tracking-[0.2em] text-violet-300">Safe preview scaffold</p><p className="mt-3 text-xl font-semibold">{definition.data.metadata.title}</p><p className="mt-2 text-sm text-slate-400">Add validated sections through the editor workflow after an approved provider is configured.</p></div></section><aside className="admin-panel"><h2 className="font-semibold">Revision history</h2><div className="mt-4 space-y-3">{project.revisions.map((revision)=><div key={revision.id} className="border-b border-white/10 pb-3 text-sm"><div className="flex justify-between"><span>Revision {revision.version}</span><time className="text-xs text-slate-500">{revision.createdAt.toLocaleString()}</time></div></div>)}</div></aside></div></main>;
}
