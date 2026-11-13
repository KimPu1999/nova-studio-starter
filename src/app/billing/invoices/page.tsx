import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';
import {listBillingAccountsForUser} from '@/lib/billing/accounts';
import {getBillingLang, formatMmk, formatDateTime} from '@/lib/billing/i18n';
import {StatusBadge, Pagination} from '../_components';
export const dynamic='force-dynamic';
const PAGE_SIZE=10;
export default async function BillingInvoices({searchParams}:{searchParams:Promise<{page?:string;status?:string;q?:string}>}){
  const {page:pageRaw,status,q}=await searchParams;
  const user=await requireUser();
  const lang=await getBillingLang();
  const mm=lang==='mm';
  const page=Math.max(1,Number(pageRaw)||1);
  const accounts=await listBillingAccountsForUser(user);
  const where={accountId:{in:accounts.map(a=>a.id)},...(status?{status:status as never}:{}),...(q?{invoiceNumber:{contains:q,mode:'insensitive' as const}}:{})};
  const [rows,count]=await Promise.all([
    prisma.billingInvoice.findMany({where,orderBy:{createdAt:'desc'},skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE+1,include:{subscription:{include:{plan:true}}}}),
    prisma.billingInvoice.count({where}),
  ]);
  const hasMore=rows.length>PAGE_SIZE;
  const visible=rows.slice(0,PAGE_SIZE);
  const filters=[['ISSUED','Issued'],['PARTIALLY_PAID','Partially paid'],['PAID','Paid'],['OVERDUE','Overdue'],['VOID','Void']];
  return <main className="admin-content">
    <p className="eyebrow">{mm?'ငွေစာရင်း':'INVOICES'}</p>
    <h1 className="admin-title">{mm?'ငွေစာရင်း':'Invoices'}</h1>
    <form className="billing-search mt-6" method="get"><input name="q" defaultValue={q||''} placeholder={mm?'ငွေစာရင်းနံပါတ်ရှာရန်':'Search invoice number'}/><button className="btn-outline" type="submit">{mm?'ရှာရန်':'Search'}</button></form>
    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      <Link className="admin-panel px-3 py-2" href="/billing/invoices">{mm?'အားလုံး':'All'}</Link>
      {filters.map(([value,label])=><Link className="admin-panel px-3 py-2" href={`/billing/invoices?status=${value}`} key={value}>{label}</Link>)}
    </div>
    <div className="admin-panel mt-5 overflow-x-auto">
      {visible.length?<table className="admin-table"><thead><tr><th>#</th><th>{mm?'ရည်ရွယ်ချက်':'Purpose'}</th><th>{mm?'အသက်သတ်':'Due'}</th><th>{mm?'စုစုပေါင်း':'Total'}</th><th>{mm?'ပေးပြီး':'Paid'}</th><th>{mm?'အခြေအနေ':'Status'}</th></tr></thead><tbody>
        {visible.map(i=><tr key={i.id}>
          <td><Link className="text-violet-300" href={`/billing/invoices/${i.id}`}>{i.invoiceNumber}</Link>{i.subscription?<small className="ml-2 text-slate-500">{i.subscription.plan.name}</small>:null}</td>
          <td>{i.purpose.replaceAll('_',' ').toLowerCase()}</td>
          <td>{formatDateTime(i.dueAt,lang)}</td>
          <td>{formatMmk(i.totalMmk,lang)}</td>
          <td>{formatMmk(i.amountPaidMmk,lang)}</td>
          <td><StatusBadge status={i.status}/></td>
        </tr>)}
      </tbody></table>:<div className="admin-empty">{mm?'ငွေစာရင်းမရှိပါ။':'No invoices yet.'}</div>}
    </div>
    <Pagination page={page} hasMore={hasMore} basePath="/billing/invoices?" lang={lang}/>
  </main>;
}
