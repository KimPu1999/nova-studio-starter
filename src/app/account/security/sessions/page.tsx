import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SecuritySessionsPage() { const user = await requireUser(); const sessions = await prisma.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }); return <main className="admin-content max-w-4xl"><p className="eyebrow">ACCOUNT SECURITY</p><h1 className="admin-title">Active sessions.</h1><section className="admin-panel mt-8"><div className="space-y-4">{sessions.map((session, index)=><div key={session.id} className="flex items-center justify-between border-b border-white/10 pb-4 text-sm"><span>{index === 0 ? 'Current or latest session' : 'Active session'}</span><span className="text-xs text-slate-500">Created {session.createdAt.toLocaleString()} · Expires {session.expiresAt.toLocaleString()}</span></div>)}{!sessions.length && <div className="admin-empty">No active sessions found.</div>}</div></section></main>; }
