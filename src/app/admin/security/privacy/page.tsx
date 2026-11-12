import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SecurityPrivacyPage() { await requireAdmin(); const requests = await prisma.privacyRequest.findMany({ where: { status: { in: ['REQUESTED', 'UNDER_REVIEW', 'PROCESSING'] } }, orderBy: { createdAt: 'desc' }, take: 10 }); return <main className="admin-content max-w-6xl"><p className="eyebrow">PRIVACY OPERATIONS</p><h1 className="admin-title">Privacy requests.</h1><section className="admin-panel mt-8">{requests.length ? requests.map(request=><div key={request.id} className="flex justify-between border-b border-white/10 py-3 text-sm"><span>{request.type} · Request {request.id.slice(0, 8)}</span><span className="text-xs text-violet-300">{request.status}</span></div>) : <div className="admin-empty">No outstanding privacy requests.</div>}</section></main>; }
