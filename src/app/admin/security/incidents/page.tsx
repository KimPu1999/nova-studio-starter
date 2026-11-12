import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SecurityIncidentsPage() { await requireAdmin(); const incidents = await prisma.securityIncident.findMany({ where: { status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' }, take: 10 }); return <main className="admin-content max-w-6xl"><p className="eyebrow">INCIDENT RESPONSE</p><h1 className="admin-title">Security incidents.</h1><section className="admin-panel mt-8">{incidents.length ? incidents.map(incident=><div key={incident.id} className="flex justify-between border-b border-white/10 py-3 text-sm"><span>{incident.title}</span><span className="text-xs text-rose-200">{incident.severity} · {incident.status}</span></div>) : <div className="admin-empty">No open incidents.</div>}</section></main>; }
