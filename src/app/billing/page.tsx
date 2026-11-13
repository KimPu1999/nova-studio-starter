import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {getOrCreatePersonalBillingAccount, listBillingAccountsForUser} from '@/lib/billing/accounts';
import {utcMonthPeriod, PAYABLE_INVOICE_STATUSES} from '@/lib/billing/constants';
import {getPeriodUsage} from '@/lib/billing/usage';
import {getBillingLang, formatMmk, formatDateTime, formatNumber} from '@/lib/billing/i18n';
import {StatusBadge} from './_components';
export const dynamic='force-dynamic';
export default async function BillingOverview(){
  const user=await requireUser();
  const lang=await getBillingLang();
  const L={
    title: lang==='mm'?'ငွေစာရင်း':'Billing',
    eyebrow: lang==='mm'?'ငွေစာရင်း':'BILLING',
    currentPlan: lang==='mm'?'လက်ရှိအစီအစဉ်':'Current plan',
    outstanding: lang==='mm'?'ကျန်ရှိသောငွေ':'Outstanding balance',
    creditBalance: lang==='mm'?'AI ကရေဒစ်လက်ကျန်':'AI credit balance',
    renewsAt: lang==='mm'?'ပြန်လည်သက်တမ်းတိုးမည့်ရက်':'Renews on',
    invoices: lang==='mm'?'ငွေစာရင်း':'Invoices',
    noPlan: lang==='mm'?'အစီအစဉ်မရှိ':'No plan',
    usedThisMonth: lang==='mm'?'ဤလအသုံးပြု':'used this month',
    verifying: lang==='mm'?'ငွေပေးချေမှု စိစစ်နေသည် — ပုံရိပ်သည် အတည်ပြုချက်မဟုတ်ပါ။':'Your payment is being verified — screenshots are not confirmation.',
    note: lang==='mm'?'ပေးချေမှုစောင့်ဆိုင်းနေသည် — ပေးချေပြီးလျှင် အထောက်အထားတင်ပါ။':'You have invoices awaiting payment. After paying, submit the transaction reference for finance verification.',
    viewAll: lang==='mm'?'အားလုံး':'View all',
    empty: lang==='mm'?'ဆိုင်ရာငွေစာရင်းမရှိပါ။':'No open invoices.',
    dueOn: lang==='mm'?'ကုန်ဆုံးရက်':'Due',
    total: lang==='mm'?'စုစုပေါင်း':'Total',
    paid: lang==='mm'?'ပေးပြီး':'Paid',
    status: lang==='mm'?'အခြေအနေ':'Status',
  };
  const account=await getOrCreatePersonalBillingAccount(user.id);
  const accounts=await listBillingAccountsForUser(user);
  const [subscription,outstanding,invoices,wallet,aiUsage,pendingReview]=await Promise.all([
    prisma.billingSubscription.findFirst({where:{accountId:account.id,scopeType:'PERSONAL',status:{in:['ACTIVE','PAST_DUE','GRACE_PERIOD','PENDING_PAYMENT']}},include:{plan:true},orderBy:{createdAt:'desc'}}),
    prisma.billingInvoice.aggregate({where:{accountId:account.id,status:{in:PAYABLE_INVOICE_STATUSES}},_sum:{totalMmk:true,amountPaidMmk:true},_count:true}),
    prisma.billingInvoice.findMany({where:{accountId:account.id,status:{in:PAYABLE_INVOICE_STATUSES}},orderBy:{dueAt:'asc'},take:10}),
    prisma.aiCreditWallet.findUnique({where:{userId:user.id}}),
    getPeriodUsage('AI_CREDITS','USER',user.id,utcMonthPeriod()),
    prisma.billingPaymentAttempt.count({where:{accountId:account.id,status:'PENDING_REVIEW'}}),
  ]);
  const outstandingMmk=Math.max(0,(outstanding._sum.totalMmk??0)-(outstanding._sum.amountPaidMmk??0));
  return <main className="admin-content">
    <p className="eyebrow">{L.eyebrow}{accounts.length>1?` · ${formatNumber(accounts.length,lang)} ${lang==='mm'?'အကောင့်':'ACCOUNTS'}`:''}</p>
    <h1 className="admin-title">{L.title}</h1>
    <div className="billing-kpis">
      <div className="billing-kpi billing-kpi-accent"><p className="billing-kpi-label">{L.currentPlan}</p><p className="billing-kpi-value">{subscription?.plan.name??L.noPlan}</p><p className="billing-kpi-sub">{subscription?.status?subscription.status.toLowerCase():''}</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">{L.outstanding}</p><p className="billing-kpi-value">{formatMmk(outstandingMmk,lang)}</p><p className="billing-kpi-sub">{formatNumber(outstanding._count,lang)} {L.invoices}</p></div>
      <div className="billing-kpi billing-kpi-cyan"><p className="billing-kpi-label">{L.creditBalance}</p><p className="billing-kpi-value">{formatNumber(wallet?.balance??0,lang)}</p><p className="billing-kpi-sub">{formatNumber(aiUsage.totalQuantity,lang)} {L.usedThisMonth}</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">{L.renewsAt}</p><p className="billing-kpi-value" style={{fontSize:'1.05rem'}}>{subscription?.renewsAt?formatDateTime(subscription.renewsAt,lang):'—'}</p><p className="billing-kpi-sub">{subscription?.cycle.toLowerCase()??''}</p></div>
    </div>
    {pendingReview>0&&<div className="billing-note mb-8">⚠️ {L.verifying} <Link className="text-violet-300" href="/billing/payments">{lang==='mm'?'စိစစ်မှု ကြည့်ရန်':'Review status'} →</Link></div>}
    {outstandingMmk>0&&<div className="billing-note mb-8">{L.note}</div>}
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">{L.invoices}</h2><Link className="text-sm text-violet-300" href="/billing/invoices">{L.viewAll} →</Link></div>
    <div className="admin-panel overflow-x-auto">
      {invoices.length?<table className="admin-table"><thead><tr><th>#</th><th>{L.dueOn}</th><th>{L.total}</th><th>{L.paid}</th><th>{L.status}</th></tr></thead><tbody>
        {invoices.map(i=><tr key={i.id}><td><Link className="text-violet-300" href={`/billing/invoices/${i.id}`}>{i.invoiceNumber}</Link></td><td>{formatDateTime(i.dueAt,lang)}</td><td>{formatMmk(i.totalMmk,lang)}</td><td>{formatMmk(i.amountPaidMmk,lang)}</td><td><StatusBadge status={i.status}/></td></tr>)}
      </tbody></table>:<div className="admin-empty">{L.empty}</div>}
    </div>
  </main>;
}
