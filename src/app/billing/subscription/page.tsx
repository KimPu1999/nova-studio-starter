import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {listBillingAccountsForUser} from '@/lib/billing/accounts';
import {listActivePlans} from '@/lib/billing/plans';
import {resolveEntitlements} from '@/lib/billing/entitlements';
import {getSeatUsage} from '@/lib/billing/seats';
import {getBillingLang, formatMmk, formatDateTime, formatNumber} from '@/lib/billing/i18n';
import {StatusBadge} from '../_components';
import {requestPlanChangeAction, cancelSubscriptionAction} from '../actions';
export const dynamic='force-dynamic';
const TIMELINE=['INCOMPLETE','PENDING_PAYMENT','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELLED','EXPIRED'];
export default async function BillingSubscription({searchParams}:{searchParams:Promise<{account?:string}>}){
  const {account:accountParam}=await searchParams;
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const accounts=await listBillingAccountsForUser(user);
  if(!accounts.length)return <main className="admin-content">
    <p className="eyebrow">{mm?'စာရင်းသွင်းမှု':'SUBSCRIPTION'}</p>
    <h1 className="admin-title">{mm?'စာရင်းသွင်းမှု':'Subscription'}</h1>
    <div className="admin-panel admin-empty mt-8">{mm?'ငွေစာရင်းအကောင့် မရှိသေးပါ — အစီအစဉ်ရွေးပါ။':'No billing account yet — pick a plan.'} <Link className="ml-2 text-violet-300" href="/billing/plans">{mm?'အစီအစဉ်များ':'Browse plans'} →</Link></div>
  </main>;
  const account=accounts.find(a=>a.id===accountParam)??accounts.find(a=>a.type==='PERSONAL')??accounts[0];
  const scopeType=account.type==='ORGANIZATION'?'WORKSPACE':'PERSONAL';
  let workspace:{id:string;name:string;organizationId:string}|null=null;
  if(scopeType==='WORKSPACE'){
    const membership=await prisma.workspaceMember.findFirst({where:{userId:user.id,workspace:{organizationId:account.organizationId??undefined}},include:{workspace:{select:{id:true,name:true,organizationId:true}}},orderBy:{createdAt:'asc'}});
    workspace=membership?.workspace??null;
  }
  const scopeId=scopeType==='PERSONAL'?user.id:workspace?.id;
  const [subscription,plans,history,entitlements]=await Promise.all([
    scopeId?prisma.billingSubscription.findFirst({where:{accountId:account.id,scopeType,status:{notIn:['CANCELLED','EXPIRED']}},include:{plan:true,planVersion:true,items:true,invoices:{orderBy:{createdAt:'desc'},take:5}},orderBy:{createdAt:'desc'}}):null,
    listActivePlans(),
    prisma.billingSubscription.findMany({where:{accountId:account.id,scopeType},include:{plan:true,planVersion:true},orderBy:{createdAt:'desc'},take:10}),
    scopeId?resolveEntitlements(account.id,scopeType,scopeId):null,
  ]);
  const seatUsage=scopeType==='WORKSPACE'&&workspace?await getSeatUsage(workspace.id,workspace.organizationId):null;
  const L={title:mm?'စာရင်းသွင်းမှု':'Subscription',plan:mm?'အစီအစဉ်':'Plan',price:mm?'စျေးနှုန်း':'Price',renews:mm?'သက်တမ်းတိုးရက်':'Renews',changePlan:mm?'အစီအစဉ်ပြောင်းရန်':'Change plan',cancel:mm?'ပယ်ဖျက်ရန်':'Cancel',cancelAtPeriodEnd:mm?'အသတ်မှတ်တွင်ပယ်ဖျက်':'Cancel at period end',cancelNow:mm?'အမြန်ပယ်ဖျက်':'Cancel now',history:mm?'မှတ်တမ်း':'History',items:mm?'အစိတ်အပိုင်းများ':'Items',invoices:mm?'လတ်တလော ငွေစာရင်း':'Recent invoices',entitlements:mm?'ခွင့်ပြုချက်များ':'Entitlements',seats:mm?'ကိုယ်စားလှယ် အသုံးပြုမှု':'Seat usage',none:mm?'စာရင်းသွင်းမှုမရှိပါ — အစီအစဉ်ရွေးပါ။':'No subscription yet — pick a plan.',empty:mm?'မှတ်တမ်းမရှိပါ။':'No history yet.',noInvoices:mm?'ငွေစာရင်းမရှိပါ။':'No invoices yet.',grace:mm?'သက်မဲ့ကာလအတွင်း အသုံးပြုနိုင်မှုဆက်ရှိသည် — ငွေပေးချေပါ။':'Entitlements continue during grace. Settle the renewal invoice to stay active.',prorate:mm?'ပြောင်းလဲမှုသည် ငွေပေးချေမှုစိစစ်ပြီးမှသာ အသုံးချမည်။':'The change applies only after the prorated invoice is verified as paid. Downgrades issue a credit note — no automatic refunds.',dataNote:mm?'ပယ်ဖျက်ပါက အခမဲ့ကာလအထိ အသုံးပြုနိုင်ပါမည်။ ဒေတာများ ထိန်းသိမ်းထားမည်။':'Cancelling keeps access until the end of the paid period. Your data is preserved.',started:mm?'စတင်':'Started',ended:mm?'ပြီးဆုံး':'Ended',status:mm?'အခြေအနေ':'Status',scope:mm?'အတိုင်းအတ':'Scope',personal:mm?'ကိုယ်ပိုင်':'Personal',org:mm?'အဖွဲ့အစည်း':'Organization'};
  return <main className="admin-content">
    <p className="eyebrow">{mm?'စာရင်းသွင်းမှု':'SUBSCRIPTION'}</p>
    <h1 className="admin-title">{L.title}</h1>
    {accounts.length>1?<div className="mt-5 flex flex-wrap gap-2">{accounts.map(a=><Link key={a.id} href={`/billing/subscription?account=${a.id}`} className={`admin-panel px-3 py-2 text-xs ${a.id===account.id?'text-violet-200':'text-slate-400'}`}>{a.type==='ORGANIZATION'?L.org:L.personal} · {a.name}</Link>)}</div>:null}
    {scopeType==='WORKSPACE'&&workspace?<p className="mt-4 text-sm text-slate-400">{L.scope}: <span className="font-semibold text-violet-200">{workspace.name}</span></p>:null}
    {!subscription?<div className="admin-panel admin-empty mt-8">{L.none} <Link className="ml-2 text-violet-300" href="/billing/plans">{mm?'အစီအစဉ်များ':'Browse plans'} →</Link></div>
    :<>
      <div className="billing-kpis">
        <div className="billing-kpi billing-kpi-accent"><p className="billing-kpi-label">{L.plan}</p><p className="billing-kpi-value">{subscription.plan.name}</p><p className="billing-kpi-sub">v{subscription.planVersion.version} · {subscription.cycle.toLowerCase()}</p></div>
        <div className="billing-kpi"><p className="billing-kpi-label">{L.price}</p><p className="billing-kpi-value">{formatMmk(subscription.priceMmk,lang)}</p><p className="billing-kpi-sub"><StatusBadge status={subscription.status}/></p></div>
        <div className="billing-kpi"><p className="billing-kpi-label">{L.renews}</p><p className="billing-kpi-value" style={{fontSize:'1.05rem'}}>{formatDateTime(subscription.renewsAt,lang)}</p><p className="billing-kpi-sub">{formatDateTime(subscription.currentPeriodStart,lang)} → {formatDateTime(subscription.currentPeriodEnd,lang)}</p></div>
        <div className="billing-kpi"><p className="billing-kpi-label">{mm?'ကိုယ်စားလှယ်':'Seats (plan)'}</p><p className="billing-kpi-value">{formatNumber(subscription.planVersion.includedSeats,lang)}</p><p className="billing-kpi-sub">{subscription.cancelAtPeriodEnd?(mm?'အသတ်တွင်ပယ်ဖျက်မည်':'Cancels at period end'):''}</p></div>
      </div>
      <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs">
        {TIMELINE.map((s,i)=>{const cur=TIMELINE.indexOf(subscription.status);return <li key={s} className={`rounded-full border px-2.5 py-1 ${i===cur?'border-violet-400/40 bg-violet-400/15 text-violet-200':i<cur?'border-emerald-400/25 bg-emerald-400/10 text-emerald-200/70':'border-white/10 bg-white/5 text-slate-500'}`}>{s.replaceAll('_',' ')}</li>;})}
      </ol>
      {subscription.graceUntil&&<div className="billing-note mb-8 mt-6">{L.grace}</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="admin-panel">
          <h2 className="font-semibold">{L.changePlan}</h2>
          <form action={requestPlanChangeAction} className="admin-form !mt-4">
            <input type="hidden" name="subscriptionId" value={subscription.id}/>
            <label>{L.plan}
              <select name="targetPlanId" className="form-input" required defaultValue="">
                <option value="" disabled>—</option>
                {plans.filter(p=>p.id!==subscription.planId).map(p=><option key={p.id} value={p.id}>{p.name} · {formatMmk(subscription.cycle==='ANNUAL'?p.versions[0].annualPriceMmk:p.versions[0].monthlyPriceMmk,lang)}</option>)}
              </select>
            </label>
            <p className="text-xs text-slate-500">{L.prorate}</p>
            <button className="btn-primary" type="submit">{L.changePlan}</button>
          </form>
        </div>
        <div className="admin-panel">
          <h2 className="font-semibold">{L.cancel}</h2>
          <p className="mt-3 text-xs text-slate-400">{L.dataNote}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={cancelSubscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id}/><button className="btn-outline" type="submit">{L.cancelAtPeriodEnd}</button></form>
            <form action={cancelSubscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id}/><input type="hidden" name="immediate" value="true"/><button className="btn-outline" type="submit">{L.cancelNow}</button></form>
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="admin-panel">
          <h2 className="font-semibold">{L.entitlements}</h2>
          <p className="mt-1 text-xs text-slate-500">{entitlements?.planCode?`${entitlements.planCode} v${entitlements.planVersion}`:''}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">Websites</p><p className="mt-1 font-semibold">{entitlements?.websitesLimit===null||entitlements?.websitesLimit===undefined?'Unlimited':formatNumber(entitlements.websitesLimit,lang)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">Domains</p><p className="mt-1 font-semibold">{entitlements?.customDomainsLimit===null||entitlements?.customDomainsLimit===undefined?'Unlimited':formatNumber(entitlements.customDomainsLimit,lang)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">Storage</p><p className="mt-1 font-semibold">{entitlements?.storageMb===null||entitlements?.storageMb===undefined?'Unlimited':`${formatNumber(entitlements.storageMb,lang)} MB`}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">Bandwidth</p><p className="mt-1 font-semibold">{entitlements?.bandwidthMb===null||entitlements?.bandwidthMb===undefined?'Unlimited':`${formatNumber(entitlements.bandwidthMb,lang)} MB`}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">AI credits / mo</p><p className="mt-1 font-semibold">{formatNumber(entitlements?.monthlyAiCredits??0,lang)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">API requests / mo</p><p className="mt-1 font-semibold">{entitlements?.monthlyApiRequests===null||entitlements?.monthlyApiRequests===undefined?'Unlimited':formatNumber(entitlements.monthlyApiRequests,lang)}</p></div>
          </div>
        </div>
        {seatUsage?<div className="admin-panel">
          <h2 className="font-semibold">{L.seats}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">{mm?'တာဝန်ပေးထားသော':'Assigned seats'}</p><p className="mt-1 font-semibold">{formatNumber(seatUsage.assignedSeats,lang)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">{mm?'စောင့်ဆိုင်းဖိတ်ကြော':'Pending invitations'}</p><p className="mt-1 font-semibold">{formatNumber(seatUsage.pendingInvitations,lang)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">{mm?'ပါဝင်သည့်':'Included seats'}</p><p className="mt-1 font-semibold">{seatUsage.includedSeats===null?'Unlimited':formatNumber(seatUsage.includedSeats,lang)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-500">{mm?'ကန့်သတ်ချက်':'Seat limit'}</p><p className="mt-1 font-semibold">{seatUsage.seatLimit===null?'Unlimited':formatNumber(seatUsage.seatLimit,lang)}</p></div>
          </div>
        </div>:null}
      </div>
      <div className="admin-panel mt-6">
        <h2 className="font-semibold">{L.items}</h2>
        <div className="mt-4 space-y-3 text-sm">{subscription.items.map(i=><div key={i.id} className="flex justify-between border-b border-white/10 pb-2"><span>{i.description}</span><span>{formatMmk(i.amountMmk,lang)}</span></div>)}</div>
      </div>
      <div className="admin-panel mt-6">
        <h2 className="font-semibold">{L.invoices}</h2>
        {subscription.invoices.length?<div className="mt-4 space-y-3 text-sm">
          {subscription.invoices.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2"><Link className="text-violet-300" href={`/billing/invoices/${i.id}`}>{i.invoiceNumber}</Link><span>{formatMmk(i.totalMmk,lang)}</span><StatusBadge status={i.status}/></div>)}
        </div>:<div className="admin-empty">{L.noInvoices}</div>}
      </div>
    </>}
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">{L.history}</h2></div>
    <div className="admin-panel overflow-x-auto">
      {history.length?<table className="admin-table"><thead><tr><th>{L.plan}</th><th>{L.status}</th><th>{L.started}</th><th>{L.ended}</th></tr></thead><tbody>
        {history.map(h=><tr key={h.id}><td>{h.plan.name} v{h.planVersion.version}</td><td><StatusBadge status={h.status}/></td><td>{formatDateTime(h.startsAt,lang)}</td><td>{formatDateTime(h.endedAt,lang)}</td></tr>)}
      </tbody></table>:<div className="admin-empty">{L.empty}</div>}
    </div>
  </main>;
}
