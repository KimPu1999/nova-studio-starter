import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {getOrCreatePersonalBillingAccount} from '@/lib/billing/accounts';
import {resolveEntitlements} from '@/lib/billing/entitlements';
import {utcMonthPeriod, BILLING_METER_CODES} from '@/lib/billing/constants';
import {getPeriodUsage} from '@/lib/billing/usage';
import {getCreditUsageHistory} from '@/lib/billing/credits';
import {getBillingLang, formatNumber, formatDateTime} from '@/lib/billing/i18n';
export const dynamic='force-dynamic';
const METER_LABELS:Record<string,[string,string]>={AI_TOKENS:['AI tokens','AI token အသုံးပြုမှု'],AI_CREDITS:['AI credits','AI ကရေဒစ်'],API_REQUESTS:['API requests','API တောင်းဆိုမှု'],HOSTING_STORAGE_MB:['Hosting storage (MB)','သိုလှောင်မှု (MB)'],HOSTING_BANDWIDTH_MB:['Hosting bandwidth (MB)','ဘန်းဒ်ဝစ်သ် (MB)'],DEPLOYMENTS:['Deployments','ဒီပလွိုင်မင့်']};
export default async function BillingUsage({searchParams}:{searchParams:Promise<{month?:string}>}){
  const {month}=await searchParams;
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const account=await getOrCreatePersonalBillingAccount(user.id);
  const period=month?utcMonthPeriod(new Date(`${month}-01T00:00:00Z`)):utcMonthPeriod();
  const entitlements=await resolveEntitlements(account.id,'PERSONAL',user.id);
  const [usage,creditEvents]=await Promise.all([
    Promise.all(BILLING_METER_CODES.map(async code=>({code,...await getPeriodUsage(code,'USER',user.id,period)}))),
    getCreditUsageHistory(user.id,20),
  ]);
  const limits:Record<string,number|null>={AI_CREDITS:entitlements.monthlyAiCredits||null,API_REQUESTS:entitlements.monthlyApiRequests};
  const monthKey=period.periodStart.toISOString().slice(0,10).slice(0,7);
  return <main className="admin-content">
    <p className="eyebrow">{mm?'အသုံးပြုမှု':'USAGE'}</p>
    <h1 className="admin-title">{mm?'အသုံးပြုမှု':'Usage'}</h1>
    <p className="mt-2 text-sm text-slate-400">{mm?'သတ်မှတ်ချက်ကျော်လျှင် အလိုအလျောက် ငွေတောင်းခံမည်မဟုတ်ပါ။':'Overage never triggers automatic charges — upgrade prompts only.'} <span className="text-slate-500">{mm?'အချိန်ဇုန် UTC':'Period is UTC'}: {monthKey}</span></p>
    <div className="admin-panel mt-8">
      {usage.filter(u=>['AI_CREDITS','AI_TOKENS','API_REQUESTS','HOSTING_STORAGE_MB'].includes(u.code)).map(u=>{
        const limit=limits[u.code]??null;
        const pct=limit?Math.min(100,Math.round(u.totalQuantity/limit*100)):0;
        const pair=METER_LABELS[u.code];
        const label=pair?(mm?pair[1]:pair[0]):u.code;
        return <div className="usage-row" key={u.code}>
          <div className="usage-head"><span>{label}</span><span>{formatNumber(u.totalQuantity,lang)}{limit!==null?` / ${formatNumber(limit,lang)}`:''}{u.isEstimated?<small className="ml-2 text-slate-500">({mm?'ခန့်မှန်း':'estimated'})</small>:null}</span></div>
          {limit!==null?<div className="usage-bar"><span className={pct>=90?'warn':''} style={{width:`${pct}%`}}/></div>:<div className="usage-bar"><span style={{width:u.totalQuantity?'18%':'0%'}}/></div>}
        </div>;})}
    </div>
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">{mm?'ကရေဒစ်အသုံးပြုမှု မှတ်တမ်း':'Recent credit activity'}</h2></div>
    <div className="admin-panel overflow-x-auto">
      {creditEvents.length?<table className="admin-table"><thead><tr><th>{mm?'ရက်စွဲ':'Date'}</th><th>{mm?'အမျိုးအစား':'Type'}</th><th>{mm?'ပမာဏ':'Amount'}</th><th>{mm?'မှတ်ချက်':'Note'}</th></tr></thead><tbody>
        {creditEvents.map(e=><tr key={e.id}><td>{formatDateTime(e.createdAt,lang)}</td><td>{e.type.replaceAll('_',' ').toLowerCase()}</td><td className={e.amount>=0?'text-emerald-300':'text-rose-300'}>{e.amount>=0?'+':''}{formatNumber(e.amount,lang)}</td><td className="text-slate-400">{e.note}</td></tr>)}
      </tbody></table>:<div className="admin-empty">{mm?'မှတ်တမ်းမရှိပါ။':'No credit activity yet.'}</div>}
    </div>
  </main>;
}
