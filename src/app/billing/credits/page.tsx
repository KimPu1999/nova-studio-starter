import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {listActiveCreditPackages, getCreditPurchaseHistory} from '@/lib/billing/credits';
import {getBillingLang, formatMmk, formatNumber, formatDateTime} from '@/lib/billing/i18n';
import {StatusBadge} from '../_components';
import {purchaseCreditsAction} from '../actions';
export const dynamic='force-dynamic';
export default async function BillingCredits(){
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const [packages,wallet,history]=await Promise.all([
    listActiveCreditPackages(),
    prisma.aiCreditWallet.findUnique({where:{userId:user.id}}),
    getCreditPurchaseHistory(user.id,15),
  ]);
  return <main className="admin-content">
    <p className="eyebrow">{mm?'AI ကရေဒစ်':'AI CREDITS'}</p>
    <h1 className="admin-title">{mm?'AI ကရေဒစ်':'AI credits'}</h1>
    <div className="billing-kpis">
      <div className="billing-kpi billing-kpi-cyan"><p className="billing-kpi-label">{mm?'လက်ကျန်':'Balance'}</p><p className="billing-kpi-value">{formatNumber(wallet?.balance??0,lang)}</p><p className="billing-kpi-sub">{mm?'Phase 13 ဝေါလက်မှတ်တိုင်':'Phase 13 wallet ledger'}</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">{mm?'ဝေါလက်စာရင်းကျမှတ်တမ်း':'Ledger entries'}</p><p className="billing-kpi-value">{formatNumber(await prisma.aiCreditLedger.count({where:{userId:user.id}}),lang)}</p><p className="billing-kpi-sub">{mm?'မှတ်တမ်းတစ်ခုစီ ပြင်လည်မရှင်းပါ':'Append-only, idempotent'}</p></div>
    </div>
    <div className="billing-note mb-8 max-w-2xl">{mm?'ကရေဒစ်များကို ငွေပေးချေမှုစိစစ်ပြီးမှသာ ထည့်ပေးမည်။':'Credits are granted only after finance verifies your payment — never before.'}</div>
    <div className="plan-grid">
      {packages.map(p=><div className="plan-card" key={p.id}>
        <div><p className="plan-name">{p.name}</p><p className="mt-1 text-xs text-slate-400">{formatNumber(p.credits+p.bonusCredits,lang)} {mm?'ကရေဒစ်':'credits'}</p></div>
        <p className="plan-price">{formatMmk(p.priceMmk,lang)}</p>
        <form action={purchaseCreditsAction}><input type="hidden" name="packageId" value={p.id}/><button className="btn-primary w-full" type="submit">{mm?'ဝယ်ယူ':'Purchase'}</button></form>
      </div>)}
    </div>
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">{mm?'ဝယ်ယူမှု မှတ်တမ်း':'Purchase & grant history'}</h2></div>
    <div className="admin-panel overflow-x-auto">
      {history.length?<table className="admin-table"><thead><tr><th>{mm?'ရက်စွဲ':'Date'}</th><th>{mm?'အမျိုးအစား':'Type'}</th><th>{mm?'ကရေဒစ်':'Credits'}</th><th>{mm?'မှတ်ချက်':'Note'}</th></tr></thead><tbody>
        {history.map(e=><tr key={e.id}><td>{formatDateTime(e.createdAt,lang)}</td><td><StatusBadge status={e.type==='CREDIT_REFUND'?'REJECTED':'ACTIVE'}/><span className="ml-2 text-slate-400">{e.type.replaceAll('_',' ').toLowerCase()}</span></td><td className={e.amount>=0?'text-emerald-300':'text-rose-300'}>{e.amount>=0?'+':''}{formatNumber(e.amount,lang)}</td><td className="text-slate-400">{e.note}</td></tr>)}
      </tbody></table>:<div className="admin-empty">{mm?'မှတ်တမ်းမရှိပါ။':'No credit purchases yet.'}</div>}
    </div>
  </main>;
}
