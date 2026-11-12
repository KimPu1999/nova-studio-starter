import Link from 'next/link';
import { requireWorkspaceAccess } from '@/lib/workspaces';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function WorkspaceClients({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const { workspace } = await requireWorkspaceAccess(slug, 'clients.manage'); const clients = await prisma.agencyClient.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { members: true, approvals: true } } }, orderBy: { createdAt: 'desc' }, take: 10 }); return <main className="admin-content max-w-6xl"><Link href={`/workspaces/${slug}`} className="text-sm text-slate-400">← Workspace</Link><h1 className="admin-title mt-5">Agency clients</h1><section className="mt-8 grid gap-4 md:grid-cols-2">{clients.map(client=><article key={client.id} className="admin-panel"><h2 className="font-semibold">{client.companyName}</h2><p className="mt-2 text-sm text-slate-400">{client.contactName} · {client.email}</p><p className="mt-3 text-xs text-slate-500">{client._count.members} portal members · {client._count.approvals} approvals</p></article>)}{!clients.length && <div className="admin-empty md:col-span-2">No clients added yet.</div>}</section></main>; }
