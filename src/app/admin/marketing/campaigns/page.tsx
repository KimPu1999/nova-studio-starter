import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {approveCampaign} from '../actions';
export const dynamic='force-dynamic';
export default async function Campaigns(){
  await requireAdmin(); const rows=await prisma.marketingCampaign.findMany({orderBy:{createdAt:'desc'},take:50,include:{createdBy:true}});
  return <main className="admin-content"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">GROWTH</p><h1 className="admin-title">Marketing campaigns</h1><p className="mt-2 text-sm text-slate-400">Campaign records are database-backed and remain inactive until approved.</p></div><Link href="/admin/marketing/campaigns/new" className="btn-primary">New campaign</Link></div><div className="admin-panel mt-8 overflow-x-auto"><table className="admin-table"><thead><tr><th>Campaign</th><th>Type</th><th>Status</th><th>Dates</th><th>Action</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><Link className="text-violet-300" href={`/admin/marketing/campaigns/${c.id}`}>{c.name}</Link><small className="block text-slate-500">{c.objective}</small></td><td>{c.type}</td><td>{c.status}</td><td>{c.startsAt?.toLocaleDateString()||'—'} → {c.endsAt?.toLocaleDateString()||'—'}</td><td>{['DRAFT','PAUSED'].includes(c.status)?<form action={approveCampaign}><input type="hidden" name="id" value={c.id}/><button className="btn-outline">Approve schedule</button></form>:<span className="text-xs text-slate-500">{c.createdBy.name}</span>}</td></tr>)}</tbody></table>{!rows.length&&<p className="admin-empty">No campaigns yet.</p>}</div></main>;
}
