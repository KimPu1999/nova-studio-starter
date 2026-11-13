import type {Prisma} from '@prisma/client';

const STATUS_STYLES: Record<string, string> = {
  // Invoice + payment + subscription states mapped to the design system badges.
  PAID: 'status-published', ACTIVE: 'status-published', APPROVED: 'status-published', MATCHED: 'status-published', VERIFIED: 'status-published', COMPLETED: 'status-published', ISSUED: 'status-draft',
  PARTIALLY_PAID: 'status-draft', PENDING_REVIEW: 'status-draft', PENDING_PAYMENT: 'status-draft', REQUESTED: 'status-draft', GRACE_PERIOD: 'status-draft', DRAFT: 'status-draft',
  INVESTIGATING: 'status-draft', OPEN: 'status-draft',
  OVERDUE: 'badge-danger', PAST_DUE: 'badge-danger', REJECTED: 'badge-danger', SUSPENDED: 'badge-danger', UNMATCHED: 'badge-danger', VOID: 'status-archived', CANCELLED: 'status-archived', EXPIRED: 'status-archived', CLOSED: 'status-archived',
};

export function StatusBadge({status}:{status:string}) {
  return <span className={`status-badge ${STATUS_STYLES[status] ?? ''}`}>{status.replaceAll('_',' ').toLowerCase()}</span>;
}

/** Compact pagination for 10-rows-per-page billing tables. `basePath` must end with '?' or '&'. */
export function Pagination({page,hasMore,basePath,lang}:{page:number;hasMore:boolean;basePath:string;lang:'en'|'mm'}) {
  return <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
    <span>{lang==='mm'?`စာမျက်နှာ ${page}`:`Page ${page}`}</span>
    <span className="flex gap-2">
      {page>1?<a className="admin-panel px-3 py-2" href={`${basePath}page=${page-1}`}>←</a>:null}
      {hasMore?<a className="admin-panel px-3 py-2" href={`${basePath}page=${page+1}`}>→</a>:null}
    </span>
  </div>;
}

export type InvoiceWithLines = Prisma.BillingInvoiceGetPayload<{include:{lines:true}}>;

export function InvoiceTotals({invoice,lang}:{invoice:InvoiceWithLines;lang:'en'|'mm'}) {
  const money=(n:number)=>formatMmkSync(n,lang);
  return <div className="mt-6 grid gap-2 text-sm">
    {invoice.lines.map(l=><div key={l.id} className="flex justify-between border-b border-white/10 pb-2"><span>{l.description}{l.quantity>1?` × ${l.quantity}`:''}</span><span>{money(l.amountMmk)}</span></div>)}
    <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{money(invoice.subtotalMmk)}</span></div>
    {invoice.discountMmk>0?<div className="flex justify-between text-slate-400"><span>Discount</span><span>-{money(invoice.discountMmk)}</span></div>:null}
    {invoice.taxMmk>0?<div className="flex justify-between text-slate-400"><span>Tax</span><span>{money(invoice.taxMmk)}</span></div>:null}
    <div className="flex justify-between text-base font-bold text-slate-100"><span>Total</span><span>{money(invoice.totalMmk)}</span></div>
    <div className="flex justify-between text-slate-400"><span>Paid</span><span>{money(invoice.amountPaidMmk)}</span></div>
    <div className="flex justify-between font-semibold text-cyan-300"><span>Outstanding</span><span>{money(Math.max(0,invoice.totalMmk-invoice.amountPaidMmk))}</span></div>
  </div>;
}

function formatMmkSync(amountMmk:number,lang:'en'|'mm'):string{
  const formatted=amountMmk.toLocaleString('en-US')+' MMK';
  if(lang!=='mm')return formatted;
  const MM_DIGITS=['၀','၁','၂','၃','၄','၅','၆','၇','၈','၉'];
  return formatted.replace(/\d/g,(d)=>MM_DIGITS[Number(d)]).replace(/MMK/g,'ကျပ်');
}
