import {prisma} from '@/lib/prisma';
import {requireFinanceAdmin} from '@/lib/billing/rbac';
import {buildRevenueReport, vendorLiabilityBreakdown} from '@/lib/billing/reports';
import {formatMmk, formatNumber} from '@/lib/billing/i18n';
export const dynamic='force-dynamic';
export default async function AdminBillingReports({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
  const {from:fromRaw,to:toRaw}=await searchParams;
  await requireFinanceAdmin();
  const to=toRaw?new Date(`${toRaw}T00:00:00Z`):new Date();
  const from=fromRaw?new Date(`${fromRaw}T00:00:00Z`):new Date(Date.UTC(to.getUTCFullYear(),to.getUTCMonth(),1));
  const [report,vendors]=await Promise.all([buildRevenueReport(from,to),vendorLiabilityBreakdown()]);
  const fmtDate=(d:Date)=>d.toISOString().slice(0,10);
  const categories=[
    ['Verified cash receipts',report.verifiedCashReceiptsMmk],
    ['Refunds',-report.refundsMmk],
    ['Net cash receipts',report.netCashReceiptsMmk],
    ['Subscription revenue',report.subscriptionRevenueMmk],
    ['AI credit sales',report.creditSalesMmk],
    ['Hosting revenue',report.hostingRevenueMmk],
    ['API revenue',report.apiRevenueMmk],
    ['Other / adjustments',report.otherRevenueMmk],
  ] as const;
  return <main className="admin-content">
    <p className="eyebrow">REVENUE REPORTS</p>
    <h1 className="admin-title">Revenue reports</h1>
    <p className="mt-2 max-w-3xl text-sm text-slate-400">Methodology: cash receipts come only from CASH_RECEIPT ledger postings (verified payments). MRR = Σ monthly-normalized price of ACTIVE subscriptions; ARR = MRR × 12. Vendor commission liabilities are reported separately and never counted as platform revenue. Unverified payments are excluded by construction. Dates are UTC, [from, to).</p>
    <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
      <label className="text-xs text-slate-400">From<input className="form-input mt-1" type="date" name="from" defaultValue={fmtDate(from)}/></label>
      <label className="text-xs text-slate-400">To<input className="form-input mt-1" type="date" name="to" defaultValue={fmtDate(to)}/></label>
      <button className="btn-outline text-sm" type="submit">Apply</button>
    </form>
    <div className="billing-kpis">
      <div className="billing-kpi billing-kpi-accent"><p className="billing-kpi-label">Net cash receipts</p><p className="billing-kpi-value">{formatMmk(report.netCashReceiptsMmk)}</p><p className="billing-kpi-sub">gross {formatMmk(report.verifiedCashReceiptsMmk)}</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">Subscription revenue</p><p className="billing-kpi-value">{formatMmk(report.subscriptionRevenueMmk)}</p><p className="billing-kpi-sub">{formatNumber(report.activeSubscriptions)} active</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">MRR / ARR</p><p className="billing-kpi-value">{formatMmk(report.mrrMmk)}</p><p className="billing-kpi-sub">ARR {formatMmk(report.arrMmk)}</p></div>
      <div className="billing-kpi"><p className="billing-kpi-label">Outstanding</p><p className="billing-kpi-value">{formatMmk(report.outstandingInvoiceMmk)}</p><p className="billing-kpi-sub">{formatNumber(report.outstandingInvoiceCount)} invoices</p></div>
    </div>
    <div className="admin-panel mt-8 overflow-x-auto">
      <h2 className="font-semibold">Revenue by category</h2>
      <table className="admin-table mt-4"><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>
        {categories.map(([label,value])=><tr key={label}><td>{label}</td><td className={value<0?'text-rose-300':''}>{formatMmk(value)}</td></tr>)}
        {report.revenueByCategory.length?<tr><td className="text-slate-500">Ledger purposes detail</td><td className="text-slate-500">{report.revenueByCategory.map(c=>`${c.category.toLowerCase()}: ${formatMmk(c.amountMmk)}`).join(' · ')}</td></tr>:null}
      </tbody></table>
    </div>
    <div className="admin-panel mt-6 overflow-x-auto">
      <h2 className="font-semibold">Vendor liabilities (separate from platform revenue)</h2>
      {vendors.length?<table className="admin-table mt-4"><thead><tr><th>Vendor</th><th>Gross</th><th>Commission</th><th>Net</th><th>Paid out</th><th>Liability</th></tr></thead><tbody>
        {vendors.map(v=><tr key={v.vendorId}><td>{v.vendorName}</td><td>{formatMmk(v.grossMmk)}</td><td>{formatMmk(v.platformCommissionMmk)}</td><td>{formatMmk(v.netMmk)}</td><td>{formatMmk(v.paidOutMmk)}</td><td className="text-amber-300">{formatMmk(v.liabilityMmk)}</td></tr>)}
      </tbody></table>:<div className="admin-empty">No vendor earnings recorded.</div>}
    </div>
  </main>;
}
