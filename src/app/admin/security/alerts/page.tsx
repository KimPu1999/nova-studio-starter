import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SecurityAlertsPage() { await requireAdmin(); const alerts = await prisma.securityAlert.findMany({ where: { status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'desc' }, take: 10 }); return <main className="admin-content max-w-6xl"><p className="eyebrow">THREAT DETECTION</p><h1 className="admin-title">Security alerts.</h1><section className="admin-panel mt-8">{alerts.length ? alerts.map(alert=><div key={alert.id} className="flex justify-between border-b border-white/10 py-3 text-sm"><span>{alert.kind} · {alert.summary}</span><span className="text-xs text-amber-200">{alert.severity} · {alert.status}</span></div>) : <div className="admin-empty">No open security alerts.</div>}</section></main>; }
