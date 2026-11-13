import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireBillingViewer} from '@/lib/billing/rbac';
import {getBillingLang, formatMmk, formatDateTime, formatNumber} from '@/lib/billing/i18n';
import {StatusBadge, Pagination} from '@/app/billing/_components';
import {voidInvoiceAction, issueInvoiceAction} from '../actions';
import type {Prisma} from '@prisma/client';
export const dynamic='force-dynamic';
const PAGE_SIZE=10;
export default async function AdminBillingInvoices({searchParams}:{searchParams:Promise<{page?:string;status?:string;search?:string}>}){
  const {page:pageRaw,status,search}=await searchParams;
  await requireBillingViewer();
  const lang=await getBillingLang();
  const page=Math.max(1,Number(pageRaw)||1);
  const where: Prisma.BillingInvoiceWhereInput = {
    ...(status?{status:status as never}:{}),
    ...(search?{invoiceNumber:{contains:search,mode:'insensitive' as never}}:{}),
  };
  const [rows,count,aggregates]=await Promise.all([
    prisma.billingInvoice.findMany({where,orderBy:{createdAt:'desc'},skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE+1,include:{account:{select:{name:true,type:true}},subscription:{include:{plan:{select:{name:true}}}}}}),
    prisma.billingInvoice.count({where}),
    prisma.billingInvoice.aggregate({where,_sum:{totalMmk:true,amountPaidMmk:true},_count:true}),
  ]);
  const hasMore=rows.length>PAGE_SIZE;
  const visible=rows.slice(0,PAGE_SIZE);
  return <main className="admin-content">
    <p className="eyebrow">INVOICES</p>
    <h1 className="admin-title">Invoices</h1>
    <p className="mt-2 text-sm text-slate-400">{formatNumber(aggregates._count,lang)} invoices · issued {formatMmk(aggregates._sum.totalMmk??0,lang)} · collected {formatMmk(aggregates._sum.amountPaidMmk??0,lang)}. Issued invoices are immutable snapshots — void unpaid ones or issue credit notes for paid ones.</p>
    <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
      <label className="text-xs text-slate-400">Search #<input className="form-input mt-1" name="search" defaultValue={search??''}/></label>
      <label className="text-xs text-slate-400">Status
        <select className="form-input mt-1" name="status" defaultValue={status??''}>
          <option value="">All</option>
          {['DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID'].map(s=><option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
      </label>
      <button className="btn-outline text-sm" type="submit">Filter</button>
    </form>
    <div className="admin-panel mt-5 overflow-x-auto">
      {visible.length?<table className="admin-table"><thead><tr><th>#</th><th>Account</th><th>Purpose</th><th>Due</th><th>Total</th><th>Paid</th><th>Status</th><th/></tr></thead><tbody>
        {visible.map(i=><tr key={i.id}>
          <td>{i.invoiceNumber}</td>
          <td>{i.account.name}<small className="block text-slate-500">{i.account.type.toLowerCase()}</small></td>
          <td>{i.purpose.replaceAll('_',' ').toLowerCase()}</td>
          <td>{formatDateTime(i.dueAt,lang)}</td>
          <td>{formatMmk(i.totalMmk,lang)}</td>
          <td>{formatMmk(i.amountPaidMmk,lang)}</td>
          <td><StatusBadge status={i.status}/></td>
          <td className="space-x-2 whitespace-nowrap">
            {i.status==='DRAFT'?<form action={issueInvoiceAction} className="inline"><input type="hidden" name="invoiceId" value={i.id}/><button className="text-xs text-violet-300 underline" type="submit">Issue</button></form>:null}
            {['DRAFT','ISSUED','OVERDUE'].includes(i.status)&&i.amountPaidMmk===0?<form action={voidInvoiceAction} className="inline"><input type="hidden" name="invoiceId" value={i.id}/><button className="text-xs text-rose-300 underline" type="submit">Void</button></form>:null}
          </td>
        </tr>)}
      </tbody></table>:<div className="admin-empty">No invoices.</div>}
    </div>
    <Pagination page={page} hasMore={hasMore} basePath={`/admin/billing/invoices?${status?`status=${status}&`:''}${search?`search=${encodeURIComponent(search)}&`:''}`} lang={lang}/>
  </main>;
}
