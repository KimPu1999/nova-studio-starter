import Link from 'next/link';
import {notFound} from 'next/navigation';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {requireBillingAccountAccess} from '@/lib/billing/accounts';
import {refundableAmountFor} from '@/lib/billing/refunds';
import {getBillingLang, formatMmk, formatDateTime} from '@/lib/billing/i18n';
import {StatusBadge, InvoiceTotals} from '../../_components';
import {PayInvoiceForm, RefundRequestForm} from '../../_forms';
export const dynamic='force-dynamic';
export default async function BillingInvoiceDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const invoice=await prisma.billingInvoice.findUnique({where:{id},include:{lines:true,account:true,paymentAttempts:{include:{reviewer:{select:{name:true}}},orderBy:{createdAt:'desc'}},creditNotes:{where:{status:{in:['REQUESTED','APPROVED','ISSUED','COMPLETED']}}}}});
  if(!invoice)notFound();
  await requireBillingAccountAccess(invoice.accountId,user);
  const outstanding=Math.max(0,invoice.totalMmk-invoice.amountPaidMmk);
  const refundedAlready=invoice.creditNotes.filter(c=>['APPROVED','ISSUED','COMPLETED'].includes(c.status)).reduce((s,c)=>s+c.amountMmk,0);
  const eligible=refundableAmountFor(invoice,refundedAlready);
  const payable=['ISSUED','PARTIALLY_PAID','OVERDUE'].includes(invoice.status);
  const L={title:mm?'ငွေစာရင်း':'Invoice',status:mm?'အခြေအနေ':'Status',account:mm?'အကောင့်':'Billing account',period:mm?'အသက်သတ်ကာလ':'Billing period',due:mm?'ကုန်ဆုံးရက်':'Due',issued:mm?'ထုတ်ပြန်':'Issued',payments:mm?'ငွေပေးချေမှု မှတ်တမ်း':'Payment attempts',refunds:mm?'ငွေပြန်မှုများ':'Refunds / credit notes',paySection:mm?'ငွေပေးချေမှုတင်ပြရန်':'Submit payment for verification',refundSection:mm?'ငွေပြန်တောင်းခံရန်':'Request refund',notPayable:mm?'ဤငွေစာရင်းသည် ငွေပေးချေမှုလက်ခံမည်မဟုတ်ပါ။':'This invoice cannot receive payments.',noAttempts:mm?'မှတ်တမ်းမရှိပါ။':'No payment attempts yet.',snapshot:mm?'ထုတ်ပြန်ချိန် မှတ်တမ်း':'Issued snapshot',refundable:mm?'ပြန်နိုင်သောပမာဏ':'Refundable'};
  return <main className="admin-content">
    <Link href="/billing/invoices" className="text-sm text-slate-400">← {mm?'ငွေစာရင်းများ':'Invoices'}</Link>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="eyebrow">{L.title}</p><h1 className="admin-title">{invoice.invoiceNumber}</h1></div>
      <div className="text-right"><StatusBadge status={invoice.status}/><p className="mt-2 text-lg font-bold">{formatMmk(outstanding,lang)} <small className="text-xs font-normal text-slate-500">{mm?'ကျန်':'outstanding'}</small></p></div>
    </div>
    <div className="admin-panel mt-8">
      <dl className="detail-grid">
        <div><dt>{L.account}</dt><dd>{invoice.account.name}</dd></div>
        <div><dt>{L.status}</dt><dd>{invoice.status.replaceAll('_',' ').toLowerCase()}</dd></div>
        <div><dt>{L.period}</dt><dd>{formatDateTime(invoice.periodStart,lang)} → {formatDateTime(invoice.periodEnd,lang)}</dd></div>
        <div><dt>{L.due}</dt><dd>{formatDateTime(invoice.dueAt,lang)}</dd></div>
        <div><dt>{L.issued}</dt><dd>{formatDateTime(invoice.issuedAt,lang)}</dd></div>
        <div><dt>{L.refundable}</dt><dd>{formatMmk(eligible,lang)}</dd></div>
      </dl>
      <InvoiceTotals invoice={invoice} lang={lang}/>
      {invoice.snapshot?<details className="mt-5"><summary className="cursor-pointer text-xs text-slate-500">{L.snapshot}</summary><pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-3 text-[11px] text-slate-400">{JSON.stringify(invoice.snapshot,null,2)}</pre></details>:null}
    </div>
    {payable&&outstanding>0&&<div className="billing-drawer"><h2 className="font-semibold">{L.paySection}</h2><p className="mt-2 mb-4 text-xs text-slate-400">{mm?'ငွေပေးချေပြီးလျှင် ငွေသွင်းအညွှန်းနှင့် အထောက်အထားတင်ပါ။ ငွေပေးချေမှုမှန်ကန်ကြောင်း ငွေရေးအရာရှိက စိစစ်ပြီးမှသာ အသုံးပြုခွင့်များ ဖွင့်လှစ်မည်။':'Pay by KBZPay/WavePay/bank, then submit the reference and receipt below. Entitlements open only after a finance admin verifies the actual transfer.'}</p><PayInvoiceForm invoiceId={invoice.id} outstanding={outstanding} lang={lang}/></div>}
    {['PAID','PARTIALLY_PAID'].includes(invoice.status)&&eligible>0&&<div className="billing-drawer"><h2 className="font-semibold">{L.refundSection}</h2><RefundRequestForm invoiceId={invoice.id} eligible={eligible} lang={lang}/></div>}
    <div className="admin-panel mt-8">
      <h2 className="font-semibold">{L.payments}</h2>
      {invoice.paymentAttempts.length?<div className="mt-4 space-y-3 text-sm">
        {invoice.paymentAttempts.map(a=><div key={a.id} className="border-b border-white/10 pb-3">
          <div className="flex flex-wrap items-center gap-3"><StatusBadge status={a.status}/><span>{a.method.replaceAll('_',' ')}</span><span>{formatMmk(a.amountMmk,lang)}</span><span className="text-slate-500">{formatDateTime(a.submittedAt,lang)}</span></div>
          <p className="mt-1 text-xs text-slate-500">{mm?'အညွှန်း':'Ref'}: {a.transactionReference}</p>
          {a.status==='APPROVED'?<p className="mt-1 text-xs text-emerald-300">{mm?'ငွေရေးဌာနမှ စိစစ်အတည်ပြုပြီး':'Verified by finance'}</p>:null}
          {a.rejectionReason?<p className="mt-1 text-xs text-rose-300">{mm?'ငြင်းပယ်ချက်':'Rejected'}: {a.rejectionReason}</p>:null}
        </div>)}
      </div>:<div className="admin-empty">{L.noAttempts}</div>}
    </div>
  </main>;
}
