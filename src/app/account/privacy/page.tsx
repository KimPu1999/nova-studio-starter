import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage() { const user = await requireUser(); const requests = await prisma.privacyRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }); return <main className="admin-content max-w-4xl"><p className="eyebrow">PRIVACY CENTER</p><h1 className="admin-title">Your data requests.</h1><p className="mt-2 text-sm text-slate-400">Financial and security records may be retained where required for fraud prevention, accounting, or legal obligations.</p><section className="admin-panel mt-8"><h2 className="font-semibold">Request history</h2><div className="mt-4 space-y-3">{requests.map(request=><div key={request.id} className="flex justify-between border-b border-white/10 pb-3 text-sm"><span>{request.type}</span><span className="text-xs text-violet-300">{request.status}</span></div>)}{!requests.length && <div className="admin-empty">No privacy requests yet.</div>}</div></section></main>; }
