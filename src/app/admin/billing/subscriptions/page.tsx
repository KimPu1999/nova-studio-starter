import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireBillingViewer} from '@/lib/billing/rbac';
import {getBillingLang, formatMmk, formatNumber, formatDateTime} from '@/lib/billing/i18n';
import {StatusBadge, Pagination} from '@/app/billing/_components';
import {adminCancelSubscriptionAction} from '../actions';
export const dynamic='force-dynamic';
const PAGE_SIZE=10;
export default async function AdminBillingSubscriptions({searchParams}:{searchParams:Promise<{page?:string;status?:string}>}){
  const {page:pageRaw,status}=await searchParams;
  await requireBillingViewer();
  const lang=await getBillingLang();
  const page=Math.max(1,Number(pageRaw)||1);
  const where={...(status?{status:status as never}:{})};
  const [rows,count,statusCounts]=await Promise.all([
    prisma.billingSubscription.findMany({where,orderBy:{createdAt:'desc'},skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE+1,include:{plan:true,planVersion:true,account:{select:{name:true,type:true}}}}),
    prisma.billingSubscription.count({where}),
    prisma.billingSubscription.groupBy({by:['status'],_count:true}),
  ]);
  const hasMore=rows.length>PAGE_SIZE;
  const visible=rows.slice(0,PAGE_SIZE);
  return <main className="admin-content">
    <p className="eyebrow">SUBSCRIPTIONS</p>
    <h1 className="admin-title">Subscriptions</h1>
    <div className="mt-6 flex flex-wrap gap-2 text-xs">
      <Link className="admin-panel px-3 py-2" href="/admin/billing/subscriptions">All ({formatNumber(count,lang)})</Link>
      {statusCounts.map(s=><Link className="admin-panel px-3 py-2" href={`/admin/billing/subscriptions?status=${s.status}`} key={s.status}>{s.status.replaceAll('_',' ').toLowerCase()} ({formatNumber(s._count,lang)})</Link>)}
    </div>
    <div className="admin-panel mt-5 overflow-x-auto">
      {visible.length?<table className="admin-table"><thead><tr><th>Account</th><th>Plan</th><th>Scope</th><th>Price</th><th>Period end</th><th>Status</th><th/></tr></thead><tbody>
        {visible.map(s=><tr key={s.id}>
          <td>{s.account.name}<small className="block text-slate-500">{s.account.type.toLowerCase()}</small></td>
          <td>{s.plan.name} v{s.planVersion.version}<small className="block text-slate-500">{s.cycle.toLowerCase()}</small></td>
          <td className="text-xs text-slate-400">{s.scopeKey}</td>
          <td>{formatMmk(s.priceMmk,lang)}</td>
          <td>{formatDateTime(s.currentPeriodEnd,lang)}</td>
          <td><StatusBadge status={s.status}/>{s.cancelAtPeriodEnd?<small className="block text-slate-500">cancels at period end</small>:null}</td>
          <td><form action={adminCancelSubscriptionAction}><input type="hidden" name="subscriptionId" value={s.id}/><button className="text-xs text-slate-400 underline" type="submit">Cancel</button></form></td>
        </tr>)}
      </tbody></table>:<div className="admin-empty">No subscriptions.</div>}
    </div>
    <Pagination page={page} hasMore={hasMore} basePath={`/admin/billing/subscriptions?${status?`status=${status}&`:''}`} lang={lang}/>
  </main>;
}
