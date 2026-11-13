import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireFinanceAdmin} from '@/lib/billing/rbac';
import {getBillingLang, formatMmk, formatDateTime, formatNumber} from '@/lib/billing/i18n';
import {StatusBadge} from '@/app/billing/_components';
import {reviewCreditNoteAction, completeCreditNoteAction} from '../actions';
export const dynamic='force-dynamic';
export default async function AdminBillingRefunds(){
  const admin=await requireFinanceAdmin();
  const lang=await getBillingLang();
  const [rows,completed]=await Promise.all([
    prisma.billingCreditNote.findMany({where:{status:{in:['REQUESTED','ISSUED']}},orderBy:{createdAt:'asc'},include:{invoice:{select:{invoiceNumber:true,totalMmk:true,amountPaidMmk:true,purpose:true}},account:{select:{name:true}},requester:{select:{name:true,email:true}}}}),
    prisma.billingCreditNote.findMany({where:{status:{in:['APPROVED','REJECTED','COMPLETED','VOID']}},orderBy:{updatedAt:'desc'},take:10,include:{invoice:{select:{invoiceNumber:true}}}}),
  ]);
  const completedTotal=completed.filter(c=>c.status==='COMPLETED').reduce((s,c)=>s+c.amountMmk,0);
  return <main className="admin-content">
    <p className="eyebrow">REFUNDS & CREDIT NOTES</p>
    <h1 className="admin-title">Refund review</h1>
    <p className="mt-2 text-sm text-slate-400">Approval reserves the amount; a refund is COMPLETED only after the payout is confirmed with method + reference. Total completed payouts: {formatMmk(completedTotal,lang)}. You cannot review your own request.</p>
    {rows.length?rows.map(c=>{const canReview=c.requestedById!==admin.id;return (
      <div className="billing-drawer" key={c.id}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">{c.creditNoteNumber}</p><p className="text-xs text-slate-400">{c.invoice?.invoiceNumber??'—'} · requested by {c.requester.name||c.requester.email} · {formatDateTime(c.createdAt,lang)}</p></div>
          <div className="text-right"><StatusBadge status={c.status}/><p className="mt-1 font-bold">{formatMmk(c.amountMmk,lang)}</p></div>
        </div>
        <p className="mt-3 text-sm text-slate-300">Reason: {c.reason}</p>
        {canReview&&c.status==='REQUESTED'?<form action={reviewCreditNoteAction} className="admin-form">
          <input type="hidden" name="creditNoteId" value={c.id}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Decision<select name="decision" className="form-input" defaultValue="APPROVED"><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></select></label>
            <label>Review note<input className="form-input" name="reviewNote"/></label>
          </div>
          <button className="btn-outline" type="submit">Record review</button>
        </form>:c.status==='REQUESTED'?<p className="mt-3 text-xs text-amber-300">Separation of duties: you requested this refund — another finance admin must review it.</p>:null}
        {canReview&&c.status==='ISSUED'?<form action={completeCreditNoteAction} className="admin-form">
          <input type="hidden" name="creditNoteId" value={c.id}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Payout method<input className="form-input" name="payoutMethod" placeholder="KBZPay / WavePay / bank" required/></label>
            <label>Payout transaction reference<input className="form-input" name="payoutReference" minLength={4} required/></label>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" name="reverseEntitlement" value="true"/> Reverse subscription entitlements (full refund of an active period)</label>
          <p className="text-xs text-slate-500">Completing posts the REFUND ledger entry (DEBIT) and reversals; it cannot push a credit wallet negative.</p>
          <button className="btn-primary" type="submit">Confirm payout & complete</button>
        </form>:null}
      </div>);})
    :<div className="admin-panel admin-empty mt-8">No refunds awaiting review.</div>}
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">Recent decisions ({formatNumber(completed.length,lang)})</h2><Link className="text-sm text-violet-300" href="/admin/billing/reconciliation">Reconciliation →</Link></div>
    <div className="admin-panel overflow-x-auto">
      {completed.length?<table className="admin-table"><thead><tr><th>Note #</th><th>Invoice</th><th>Amount</th><th>Status</th><th>Payout</th><th>Updated</th></tr></thead><tbody>
        {completed.map(c=><tr key={c.id}><td>{c.creditNoteNumber}</td><td>{c.invoice?.invoiceNumber??'—'}</td><td>{formatMmk(c.amountMmk,lang)}</td><td><StatusBadge status={c.status}/></td><td className="text-xs text-slate-400">{c.payoutMethod?`${c.payoutMethod} · ${c.payoutReference}`:'—'}</td><td>{formatDateTime(c.updatedAt,lang)}</td></tr>)}
      </tbody></table>:<div className="admin-empty">No decisions yet.</div>}
    </div>
  </main>;
}
