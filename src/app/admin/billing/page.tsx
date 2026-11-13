import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireBillingViewer} from '@/lib/billing/rbac';
import {buildRevenueReport} from '@/lib/billing/reports';
import {utcMonthPeriod, PAYABLE_INVOICE_STATUSES} from '@/lib/billing/constants';
import {formatMmk, formatNumber, formatDateTime} from '@/lib/billing/i18n';
import {StatusBadge} from '@/app/billing/_components';
import {runBillingSweepAction} from './actions';
export const dynamic='force-dynamic';
export default async function AdminBillingOverview(){
  const admin=await requireBillingViewer();
  const period=utcMonthPeriod();
  const report=await buildRevenueReport(period.periodStart,period.periodEnd);
  const [pendingPayments,pendingRefunds,pastDue,invoices,recentLedger]=await Promise.all([
    prisma.billingPaymentAttempt.count({where:{status:'PENDING_REVIEW'}}),
    prisma.billingCreditNote.count({where:{status:{in:['REQUESTED','ISSUED']}}}),
    prisma.billingSubscription.count({where:{status:{in:['PAST_DUE','GRACE_PERIOD','SUSPENDED']}}}),
    prisma.billingInvoice.findMany({where:{status:{in:PAYABLE_INVOICE_STATUSES}},orderBy:{dueAt:'asc'},take:8}),
    prisma.billingLedgerEntry.findMany({orderBy:{postedAt:'desc'},take:8,include:{invoice:{select:{invoiceNumber:true}}}}),
  ]);
  return <main className="admin-content">
    <p className="eyebrow">REVENUE OPERATIONS</p>
    <h1 className="admin-title">Billing control center</h1>
    <p className="mt-2 text-sm text-slate-400">Verified cash only — unverified payments are never counted as revenue. Period: {period.periodStart.toISOString().slice(0,10)} → {period.periodEnd.toISOString().slice(0,10)} (UTC).</p>
    <div className="billing-kpis">
      <div className="billing-kpi billing-kpi-accent"><p className="billing-kpi-label">Verified cash receipts</p><p className="billing-kpi-value">{formatMmk(report.verifiedCashReceiptsMmk)}</p><p className="billing-kpi-sub">{formatMmk(report.refundsMmk)} refunded</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">MRR / ARR</p><p className="billing-kpi-value">{formatMmk(report.mrrMmk)}</p><p className="billing-kpi-sub">ARR {formatMmk(report.arrMmk)} · {formatNumber(report.activeSubscriptions)} active subs</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">Outstanding invoices</p><p className="billing-kpi-value">{formatMmk(report.outstandingInvoiceMmk)}</p><p className="billing-kpi-sub">{formatNumber(report.outstandingInvoiceCount)} open</p></div>
      <div className="billing-kpi billing-kpi-cyan"><p className="billing-kpi-label">Vendor liabilities</p><p className="billing-kpi-value">{formatMmk(report.vendorLiabilitiesMmk)}</p><p className="billing-kpi-sub">kept out of platform revenue</p></div>
    </div>
    <div className="billing-kpis">
      <div className="billing-kpi"><p className="billing-kpi-label">Payment reviews</p><p className="billing-kpi-value">{formatNumber(pendingPayments)}</p><Link className="billing-kpi-sub text-violet-300" href="/admin/billing/payments">Open queue →</Link></div>
      <div className="billing-kpi"><p className="billing-kpi-label">Refunds to review</p><p className="billing-kpi-value">{formatNumber(pendingRefunds)}</p><Link className="billing-kpi-sub text-violet-300" href="/admin/billing/refunds">Review →</Link></div>
      <div className="billing-kpi"><p className="billing-kpi-label">Subscriptions at risk</p><p className="billing-kpi-value">{formatNumber(pastDue)}</p><Link className="billing-kpi-sub text-violet-300" href="/admin/billing/subscriptions">Manage →</Link></div>
      <div className="billing-kpi"><p className="billing-kpi-label">Credit / hosting / API revenue</p><p className="billing-kpi-value">{formatMmk(report.creditSalesMmk+report.hostingRevenueMmk+report.apiRevenueMmk)}</p><p className="billing-kpi-sub">credits {formatMmk(report.creditSalesMmk)} · hosting {formatMmk(report.hostingRevenueMmk)}</p></div>
    </div>
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">Open invoices</h2></div>
    <div className="admin-panel overflow-x-auto">
      {invoices.length?<table className="admin-table"><thead><tr><th>#</th><th>Due</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>
        {invoices.map(i=><tr key={i.id}><td><Link className="text-violet-300" href={`/admin/billing/invoices?search=${i.invoiceNumber}`}>{i.invoiceNumber}</Link></td><td>{formatDateTime(i.dueAt)}</td><td>{formatMmk(i.totalMmk)}</td><td>{formatMmk(i.amountPaidMmk)}</td><td><StatusBadge status={i.status}/></td></tr>)}
      </tbody></table>:<div className="admin-empty">No open invoices.</div>}
    </div>
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">Latest ledger postings</h2><form action={runBillingSweepAction}><button className="btn-outline text-sm" type="submit">Run billing sweep</button></form></div>
    <div className="admin-panel overflow-x-auto">
      {recentLedger.length?<table className="admin-table"><thead><tr><th>Posted</th><th>Type</th><th>Amount</th><th>Invoice</th><th>Source</th></tr></thead><tbody>
        {recentLedger.map(e=><tr key={e.id}><td>{formatDateTime(e.postedAt)}</td><td>{e.entryType.replaceAll('_',' ').toLowerCase()}</td><td className={e.direction==='DEBIT'?'text-rose-300':'text-emerald-300'}>{e.direction==='DEBIT'?'-':''}{formatMmk(e.amountMmk)}</td><td>{e.invoice?.invoiceNumber??'—'}</td><td className="text-slate-400">{e.sourceType}</td></tr>)}
      </tbody></table>:<div className="admin-empty">No ledger postings yet.</div>}
    </div>
  </main>;
}
