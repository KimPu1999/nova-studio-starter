import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireFinanceAdmin} from '@/lib/billing/rbac';
import {getBillingLang, formatMmk, formatDateTime, formatNumber} from '@/lib/billing/i18n';
import {StatusBadge, Pagination} from '@/app/billing/_components';
import {reviewPaymentAction} from '../actions';
export const dynamic='force-dynamic';
const PAGE_SIZE=10;
export default async function AdminBillingPayments({searchParams}:{searchParams:Promise<{page?:string;status?:string}>}){
  const {page:pageRaw,status}=await searchParams;
  const admin=await requireFinanceAdmin();
  const lang=await getBillingLang();
  const page=Math.max(1,Number(pageRaw)||1);
  const where={...(status?{status:status as never}:{})};
  const [rows,count,queueCount]=await Promise.all([
    prisma.billingPaymentAttempt.findMany({where,orderBy:{createdAt:'desc'},skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE+1,include:{invoice:{select:{invoiceNumber:true,id:true,purpose:true}},account:{select:{name:true,type:true}},submittedBy:{select:{name:true,email:true}},reviewer:{select:{name:true}}}}),
    prisma.billingPaymentAttempt.count({where}),
    prisma.billingPaymentAttempt.count({where:{status:'PENDING_REVIEW'}}),
  ]);
  const hasMore=rows.length>PAGE_SIZE;
  const visible=rows.slice(0,PAGE_SIZE);
  return <main className="admin-content">
    <p className="eyebrow">PAYMENT VERIFICATION</p>
    <h1 className="admin-title">Payment verification queue</h1>
    <div className="billing-note mt-6 mb-8 max-w-3xl">Verify against the ACTUAL KBZPay/WavePay/bank transaction history — never against the screenshot alone. Approval atomically applies the invoice payment, posts the ledger, and activates entitlements. Rejection requires a reason. You cannot review your own submission.</div>
    <div className="mt-6 flex flex-wrap gap-2 text-xs">
      <Link className="admin-panel px-3 py-2" href="/admin/billing/payments">All ({formatNumber(count,lang)})</Link>
      <Link className="admin-panel px-3 py-2" href="/admin/billing/payments?status=PENDING_REVIEW">Pending ({formatNumber(queueCount,lang)})</Link>
    </div>
    {visible.length?visible.map(a=>{const canReview=a.status==='PENDING_REVIEW'&&a.submittedById!==admin.id;return (
      <div className="billing-drawer" key={a.id}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">{a.invoice.invoiceNumber}</p><p className="text-xs text-slate-400">{a.account.name} ({a.account.type.toLowerCase()}) · submitted by {a.submittedBy.name||a.submittedBy.email} · {formatDateTime(a.submittedAt,lang)}</p></div>
          <div className="text-right"><StatusBadge status={a.status}/><p className="mt-1 font-bold">{formatMmk(a.amountMmk,lang)}</p></div>
        </div>
        <div className="detail-grid mt-4">
          <div><dt>Method / reference</dt><dd>{a.method.replaceAll('_',' ')} · <span className="font-mono">{a.transactionReference}</span></dd></div>
          <div><dt>Invoice purpose</dt><dd>{a.invoice.purpose.replaceAll('_',' ').toLowerCase()}</dd></div>
        </div>
        {a.proofStorageKey?<p className="mt-3 text-xs"><a className="text-violet-300 underline" href={`/admin/billing/payments/proof?key=${encodeURIComponent(a.proofStorageKey)}`} target="_blank">Open proof (finance only)</a><span className="ml-2 text-slate-500">record only — not proof of payment</span></p>:null}
        {a.verificationNote?<p className="mt-2 text-xs text-emerald-300">Verified by {a.reviewer?.name}: {a.verificationNote}</p>:null}
        {a.rejectionReason?<p className="mt-2 text-xs text-rose-300">Rejected: {a.rejectionReason}</p>:null}
        {canReview?<form action={reviewPaymentAction} className="admin-form">
          <input type="hidden" name="attemptId" value={a.id}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Decision
              <select name="decision" className="form-input" defaultValue="APPROVED">
                <option value="APPROVED">Approve — transfer confirmed in wallet/bank</option>
                <option value="REJECTED">Reject</option>
              </select>
            </label>
            <label>Verification note (required for approval)<input className="form-input" name="verificationNote" placeholder="Confirmed in KBZPay merchant statement…"/></label>
          </div>
          <label>Rejection reason (required for rejection)<input className="form-input" name="rejectionReason"/></label>
          <button className="btn-primary" type="submit">Record decision</button>
        </form>:a.status==='PENDING_REVIEW'&&a.submittedById===admin.id?<p className="mt-3 text-xs text-amber-300">Separation of duties: you submitted this attempt — another finance admin must review it.</p>:null}
      </div>);})
    :<div className="admin-panel admin-empty mt-8">No payment attempts.</div>}
    <Pagination page={page} hasMore={hasMore} basePath={`/admin/billing/payments?${status?`status=${status}&`:''}`} lang={lang}/>
  </main>;
}
