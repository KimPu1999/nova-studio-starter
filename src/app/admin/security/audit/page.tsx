import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SecurityAuditPage() { await requireAdmin(); const events = await prisma.securityAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }); return <main className="admin-content max-w-6xl"><p className="eyebrow">SECURITY EVENTS</p><h1 className="admin-title">Audit log.</h1><section className="admin-panel mt-8">{events.length ? events.map(event=><div key={event.id} className="flex justify-between border-b border-white/10 py-3 text-sm"><span>{event.action} · {event.resource}</span><time className="text-xs text-slate-500">{event.createdAt.toLocaleString()}</time></div>) : <div className="admin-empty">No security audit events recorded.</div>}</section></main>; }
