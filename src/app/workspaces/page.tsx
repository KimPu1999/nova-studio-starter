import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function WorkspacesPage() {
  const user = await requireUser();
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id }, include: { workspace: { include: { organization: true, _count: { select: { members: true, projects: true } } } } }, orderBy: { createdAt: 'desc' } });
  return <main className="admin-content max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">ENTERPRISE WORKSPACES</p><h1 className="admin-title">Your teams.</h1><p className="mt-2 text-sm text-slate-400">Private organizations for shared websites, projects, assets, and client approvals.</p></div><Link href="/workspaces/new" className="btn-primary"><Plus size={16}/> New organization</Link></div><section className="mt-8 grid gap-4 md:grid-cols-2">{memberships.map(({ workspace, role })=><Link href={`/workspaces/${workspace.slug}`} key={workspace.id} className="admin-panel transition hover:border-violet-400/40"><div className="flex items-center gap-3"><div className="admin-stat-icon admin-stat-accent"><Users size={17}/></div><div><h2 className="font-semibold">{workspace.organization.name}</h2><p className="text-xs text-slate-500">{workspace.name} · {role}</p></div></div><p className="mt-4 text-sm text-slate-400">{workspace._count.members} members · {workspace._count.projects} shared projects</p></Link>)}{!memberships.length && <div className="admin-empty md:col-span-2">You are not a member of any workspace yet.</div>}</section></main>;
}
