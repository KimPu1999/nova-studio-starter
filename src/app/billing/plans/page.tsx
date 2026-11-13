import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {listActivePlans} from '@/lib/billing/plans';
import {getBillingLang, formatNumber} from '@/lib/billing/i18n';
import {subscribeAction} from '../actions';
export const dynamic='force-dynamic';
const FEATURE_LABELS:Record<string,[string,string]>={aiBuilder:['AI website builder','AI ဝက်ဘ်ဆိုက်တည်ဆောက်မှု'],hosting:['Website hosting','ဝက်ဘ်ဆိုက်လက်ခံမှု'],customDomain:['Custom domains','ကိုယ်ပိုင်ဒိုမိန်း'],apiAccess:['Developer API access','API အသုံးပြုခွင့်'],prioritySupport:['Priority support','အစားထိုးကူညီမှု'],auditLog:['Audit log','စစ်ဆေးမှတ်တမ်း'],whiteLabel:['White label','ဝှိုက်လေဘယ်'],sso:['SSO / SAML','SSO / SAML']};
export default async function BillingPlans({searchParams}:{searchParams:Promise<{cycle?:string}>}){
  const {cycle}=await searchParams;
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const activeCycle=cycle==='ANNUAL'?'ANNUAL':'MONTHLY';
  const [plans,manageableMemberships,personalAccount]=await Promise.all([
    listActivePlans(),
    prisma.workspaceMember.findMany({where:{userId:user.id,role:{in:['OWNER','ADMIN']}},include:{workspace:{select:{id:true,name:true}}},orderBy:{createdAt:'asc'}}),
    prisma.billingAccount.findFirst({where:{ownerUserId:user.id,type:'PERSONAL',isActive:true},select:{id:true}}),
  ]);
  const workspaces=manageableMemberships.map(m=>m.workspace);
  const currentPlanIds=personalAccount?new Set((await prisma.billingSubscription.findMany({where:{accountId:personalAccount.id,status:'ACTIVE'},select:{planId:true}})).map(s=>s.planId)):new Set<string>();
  return <main className="admin-content">
    <p className="eyebrow">{mm?'အစီအစဉ်များ':'PLAN CATALOG'}</p>
    <h1 className="admin-title">{mm?'အစီအစဉ်များ':'Plans'}</h1>
    <p className="mt-2 text-sm text-slate-400">{mm?'စာရင်းသွင်းမှုသည် ငွေပေးချေမှုစိစစ်ပြီးမှသာ လည်ပတ်မည်။':'Subscriptions activate only after finance verifies your payment.'}</p>
    <div className="cycle-selector mt-6">
      <Link href="/billing/plans" className={activeCycle==='MONTHLY'?'active':''}>{mm?'လစဉ်':'Monthly'}</Link>
      <Link href="/billing/plans?cycle=ANNUAL" className={activeCycle==='ANNUAL'?'active':''}>{mm?'နှစ်စဉ်':'Annual'}</Link>
    </div>
    <div className="plan-grid">
      {plans.map(p=>{const v=p.versions[0];const price=activeCycle==='ANNUAL'?v.annualPriceMmk:v.monthlyPriceMmk;const isCurrent=currentPlanIds.has(p.id);return (
        <div key={p.id} className={`plan-card ${p.tier==='PRO'?'plan-card-featured':''}`}>
          <div><span className="status-badge status-draft">{p.tier}</span><p className="plan-name mt-3">{p.name}</p><p className="mt-1 text-xs text-slate-400">{p.description}</p></div>
          <p className="plan-price">{price===0?(mm?'အခမဲ့':'Free'):formatNumber(price,lang)}<small> {activeCycle==='ANNUAL'?'/ yr':'/ mo'}</small></p>
          <ul className="plan-features">
            <li>{mm?'ကိုယ်စားလှယ်':'Seats'}: {formatNumber(v.includedSeats,lang)}{v.maxSeats?` → ${formatNumber(v.maxSeats,lang)}`:''}</li>
            <li>{mm?'ဝက်ဘ်ဆိုက်':'Websites'}: {v.websitesLimit===null?(mm?'ကန့်သတ်ချက်မရှိ':'Unlimited'):formatNumber(v.websitesLimit,lang)}</li>
            <li>{mm?'ဒိုမိန်း':'Domains'}: {v.customDomainsLimit===null?(mm?'ကန့်သတ်ချက်မရှိ':'Unlimited'):formatNumber(v.customDomainsLimit,lang)}</li>
            <li>{mm?'သိုလှောင်မှု':'Storage'}: {v.storageMb===null?(mm?'ကန့်သတ်ချက်မရှိ':'Unlimited'):`${formatNumber(v.storageMb,lang)} MB`}</li>
            <li>AI: {formatNumber(v.monthlyAiCredits,lang)} {mm?'ကရေဒစ်/လ':'credits/mo'}</li>
            <li>API: {v.monthlyApiRequests===null?(mm?'ကန့်သတ်ချက်မရှိ':'Unlimited'):formatNumber(v.monthlyApiRequests,lang)}{v.monthlyApiRequests===0?(mm?' (မပါ)':' (none)'):''}</li>
            {Object.entries(FEATURE_LABELS).map(([key,[en,label]])=><li key={key} className={v.features.includes(key)?'':'no'}>{mm?label:en}</li>)}
          </ul>
          {isCurrent?<p className="mb-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-center text-xs text-emerald-200">{mm?'လက်ရှိအစီအစဉ်':'Current plan'}</p>:null}
          <form action={subscribeAction}>
            <input type="hidden" name="planId" value={p.id}/>
            <input type="hidden" name="cycle" value={activeCycle}/>
            <fieldset className="mb-3 space-y-1.5 text-xs text-slate-300">
              <legend className="mb-1 font-semibold text-slate-400">{mm?'ငွေစာရင်း အတိုင်းအတ':'Billing scope'}</legend>
              <label className="flex items-center gap-2"><input type="radio" name="scope" value="PERSONAL" defaultChecked className="accent-violet-500"/>{mm?'ကိုယ်ပိုင်':'Personal'}</label>
              {workspaces.length?<label className="flex items-center gap-2"><input type="radio" name="scope" value="WORKSPACE" className="accent-violet-500"/>{mm?'ဝတ်က်စပေ့စ်':'Workspace'}</label>:null}
            </fieldset>
            {workspaces.length?<label className="mb-3 block text-xs text-slate-400">{mm?'ဝတ်က်စပေ့စ်':'Workspace'}
              <select name="workspaceId" className="form-input mt-1 text-sm">
                {workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>:null}
            <button className="btn-primary w-full" type="submit">{mm?'ဤအစီအစဉ်ရွေး':'Choose this plan'}</button>
          </form>
        </div>);})}
    </div>
  </main>;
}
