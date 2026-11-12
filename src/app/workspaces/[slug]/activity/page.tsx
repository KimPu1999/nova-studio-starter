import Link from 'next/link';
import { requireWorkspaceAccess } from '@/lib/workspaces';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function WorkspaceActivity({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const { workspace } = await requireWorkspaceAccess(slug, 'audit.read'); const events = await prisma.workspaceAuditLog.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' }, take: 10 }); return <main className="admin-content max-w-5xl"><Link href={`/workspaces/${slug}`} className="text-sm text-slate-400">← Workspace</Link><h1 className="admin-title mt-5">Activity</h1><section className="admin-panel mt-8">{events.length ? <div className="space-y-4">{events.map(event=><div key={event.id} className="flex justify-between border-b border-white/10 pb-3 text-sm"><span>{event.action} <span className="text-slate-500">{event.resource}</span></span><time className="text-xs text-slate-500">{event.createdAt.toLocaleString()}</time></div>)}</div> : <div className="admin-empty">No workspace activity yet.</div>}</section></main>; }
