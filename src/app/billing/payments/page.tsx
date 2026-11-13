import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {listBillingAccountsForUser} from '@/lib/billing/accounts';
import {getBillingLang, formatMmk, formatDateTime} from '@/lib/billing/i18n';
import {StatusBadge, Pagination} from '../_components';
import {cancelPaymentAttemptAction} from '../actions';
export const dynamic='force-dynamic';
const PAGE_SIZE=10;
export default async function BillingPayments({searchParams}:{searchParams:Promise<{page?:string;status?:string}>}){
  const {page:pageRaw,status}=await searchParams;
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const page=Math.max(1,Number(pageRaw)||1);
  const accounts=await listBillingAccountsForUser(user);
  const where={accountId:{in:accounts.map(a=>a.id)},...(status?{status:status as never}:{})};
  const [rows,count]=await Promise.all([
    prisma.billingPaymentAttempt.findMany({where,orderBy:{createdAt:'desc'},skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE+1,include:{invoice:{select:{invoiceNumber:true,id:true}}}}),
    prisma.billingPaymentAttempt.count({where}),
  ]);
  const hasMore=rows.length>PAGE_SIZE;
  const visible=rows.slice(0,PAGE_SIZE);
  return <main className="admin-content">
    <p className="eyebrow">{mm?'ငွေပေးချေမှု':'PAYMENTS'}</p>
    <h1 className="admin-title">{mm?'ငွေပေးချေမှုများ':'Payments'}</h1>
    <div className="billing-note mt-6 mb-5 max-w-2xl">{mm?'ပုံရိပ်များသည် ပြန်လည်သုံးသပ်ရန်အတွက်သာ။ ငွေပေးချေမှုအတည်ပြုချက်ကို ငွေရေးအရာရှိများက လက်ခံရရှိမှုမှတ်တမ်းနှင့် တိုက်ဆိုင်စစ်ဆေးသည်။':'Proofs are records for review only. Finance staff verify each transfer against the actual wallet/bank statement before anything is activated.'}</div>
    <div className="billing-filters"><Link href="/billing/payments" className={!status?'active':''}>{mm?'အားလုံး':'All'}</Link>{['PENDING_REVIEW','APPROVED','REJECTED','CANCELLED'].map(s=><Link key={s} href={'/billing/payments?status='+s} className={status===s?'active':''}>{s.replaceAll('_',' ')}</Link>)}</div>
    <div className="admin-panel overflow-x-auto">
      {visible.length?<table className="admin-table"><thead><tr><th>{mm?'ငွေစာရင်း':'Invoice'}</th><th>{mm?'နည်းလမ်း':'Method'}</th><th>{mm?'အညွှန်း':'Reference'}</th><th>{mm?'ပမာဏ':'Amount'}</th><th>{mm?'အခြေအနေ':'Status'}</th><th/></tr></thead><tbody>
        {visible.map(a=><tr key={a.id}>
          <td><Link className="text-violet-300" href={`/billing/invoices/${a.invoice.id}`}>{a.invoice.invoiceNumber}</Link></td>
          <td>{a.method.replaceAll('_',' ')}</td>
          <td className="font-mono text-xs">{a.transactionReference}</td>
          <td>{formatMmk(a.amountMmk,lang)}</td>
          <td><StatusBadge status={a.status}/><small className="block text-slate-500">{formatDateTime(a.reviewedAt,lang)}</small></td>
          <td>{a.status==='PENDING_REVIEW'&&a.submittedById===user.id?<form action={cancelPaymentAttemptAction}><input type="hidden" name="attemptId" value={a.id}/><button className="text-xs text-slate-400 underline" type="submit">{mm?'ပယ်ဖျက်':'Cancel'}</button></form>:null}</td>
        </tr>)}
      </tbody></table>:<div className="admin-empty">{mm?'ငွေပေးချေမှုမှတ်တမ်းမရှိပါ။':'No payment submissions yet.'}</div>}
    </div>
    <Pagination page={page} hasMore={hasMore} basePath="/billing/payments?" lang={lang}/>
  </main>;
}
