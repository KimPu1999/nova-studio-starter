import Link from 'next/link';
import {RoleCode} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {reviewVendorPayout, completeVendorPayout} from '@/app/admin/vendors/actions';
export const dynamic='force-dynamic';

const PENDING=['REQUESTED','UNDER_REVIEW'];
const ACTIONABLE=['APPROVED','PROCESSING'];

export default async function VendorPayoutsAdmin(){
  await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.FINANCE_ADMIN,RoleCode.ADMIN]);
  const rows=await prisma.vendorPayoutRequest.findMany({orderBy:{requestedAt:'desc'},take:100,include:{vendor:true,account:true}});
  const pending=rows.filter(r=>PENDING.includes(r.status));
  const actionable=rows.filter(r=>ACTIONABLE.includes(r.status));
  return <main className="admin-content">
    <p className="eyebrow">VENDOR FINANCE</p>
    <h1 className="admin-title">Vendor payouts</h1>
    <p className="mt-2 max-w-2xl text-sm text-slate-400">Requests reserve funds in the vendor ledger. Approve to reserve review, reject to release the reservation, and complete only after confirming the actual transfer (method + reference). Completed payouts are recorded in <Link className="text-violet-300" href="/admin/billing/reports">finance reports</Link>.</p>
    <div className="admin-panel mt-8 overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">Pending requests</h2>
      <table className="admin-table">
        <thead><tr><th>Vendor</th><th>Amount</th><th>Account</th><th>Requested</th><th>Status</th><th>Decision</th></tr></thead>
        <tbody>
          {pending.map(r=><tr key={r.id}>
            <td><Link className="text-violet-300" href={`/vendors/${r.vendor.storeSlug}`}>{r.vendor.storeName}</Link></td>
            <td>{r.amountMmk.toLocaleString()} MMK</td>
            <td><small className="text-slate-400">{r.account.method} · ••{r.account.accountNumber.slice(-4)}</small></td>
            <td>{r.requestedAt.toLocaleDateString()}</td>
            <td>{r.status}</td>
            <td className="space-y-2">
              <form action={reviewVendorPayout} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={r.id}/>
                <input name="note" placeholder="Review note" className="form-input max-w-40" autoComplete="off"/>
                <button name="decision" value="APPROVED" className="btn-primary">Approve</button>
                <button name="decision" value="REJECTED" className="btn-ghost">Reject</button>
              </form>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!pending.length&&<p className="admin-empty">No pending payout requests.</p>}
    </div>
    <div className="admin-panel mt-8 overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">Approved — awaiting transfer</h2>
      <table className="admin-table">
        <thead><tr><th>Vendor</th><th>Amount</th><th>Account</th><th>Requested</th><th>Status</th><th>Complete transfer</th></tr></thead>
        <tbody>
          {actionable.map(r=><tr key={r.id}>
            <td><Link className="text-violet-300" href={`/vendors/${r.vendor.storeSlug}`}>{r.vendor.storeName}</Link></td>
            <td>{r.amountMmk.toLocaleString()} MMK</td>
            <td><small className="text-slate-400">{r.account.method} · ••{r.account.accountNumber.slice(-4)}</small></td>
            <td>{r.requestedAt.toLocaleDateString()}</td>
            <td>{r.status}</td>
            <td>
              <form action={completeVendorPayout} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={r.id}/>
                <input name="method" placeholder="Method (KBZPay…)" className="form-input max-w-36" required autoComplete="off"/>
                <input name="reference" placeholder="Transaction ref" className="form-input max-w-36" required autoComplete="off"/>
                <button className="btn-primary">Mark paid</button>
              </form>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!actionable.length&&<p className="admin-empty">No approved payouts awaiting transfer.</p>}
    </div>
    <div className="admin-panel mt-8 overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">History</h2>
      <table className="admin-table">
        <thead><tr><th>Vendor</th><th>Amount</th><th>Status</th><th>Requested</th><th>Reviewed</th><th>Paid</th></tr></thead>
        <tbody>{rows.map(r=><tr key={r.id}><td>{r.vendor.storeName}</td><td>{r.amountMmk.toLocaleString()} MMK</td><td>{r.status}</td><td>{r.requestedAt.toLocaleDateString()}</td><td>{r.reviewedAt?.toLocaleDateString()||'—'}</td><td>{r.paidAt?.toLocaleDateString()||'—'}</td></tr>)}</tbody>
      </table>
      {!rows.length&&<p className="admin-empty">No payout requests yet.</p>}
    </div>
  </main>;
}
