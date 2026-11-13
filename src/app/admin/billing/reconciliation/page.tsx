import {prisma} from '@/lib/prisma';
import {requireFinanceAdmin} from '@/lib/billing/rbac';
import {defaultReconciliationPeriod} from '@/lib/billing/reconciliation';
import {getBillingLang, formatMmk, formatDateTime, formatNumber} from '@/lib/billing/i18n';
import {StatusBadge} from '@/app/billing/_components';
import {createReconciliationAction, resolveReconciliationItemAction, closeReconciliationAction} from '../actions';
export const dynamic='force-dynamic';
export default async function AdminBillingReconciliation({searchParams}:{searchParams:Promise<{report?:string}>}){
  const {report:reportId}=await searchParams;
  const admin=await requireFinanceAdmin();
  const lang=await getBillingLang();
  const period=defaultReconciliationPeriod();
  const runs=await prisma.billingReconciliation.findMany({orderBy:{createdAt:'desc'},take:10,include:{items:{orderBy:{createdAt:'asc'}},importer:{select:{name:true}},closer:{select:{name:true}}}});
  const selected=reportId?runs.find(r=>r.id===reportId)??null:runs[0]??null;
  return <main className="admin-content">
    <p className="eyebrow">FINANCIAL RECONCILIATION</p>
    <h1 className="admin-title">Reconciliation</h1>
    <p className="mt-2 max-w-3xl text-sm text-slate-400">Runs compare verified payment attempts against (optionally imported) bank/wallet statement rows: reference+amount matching, duplicate reference detection, missing statement rows, and missing ledger postings. Nothing is auto-approved; unmatched items stay UNMATCHED until a human decides. Statements are stored privately.</p>
    <div className="billing-drawer max-w-3xl">
      <h2 className="font-semibold">New reconciliation run</h2>
      <form action={createReconciliationAction} className="admin-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Period start (UTC)<input className="form-input" type="date" name="periodStart" defaultValue={period.periodStart.toISOString().slice(0,10)} required/></label>
          <label>Period end (UTC, exclusive)<input className="form-input" type="date" name="periodEnd" defaultValue={period.periodEnd.toISOString().slice(0,10)} required/></label>
        </div>
        <label>Statement name<input className="form-input" name="statementName" placeholder="KBZPay merchant export Nov 2026"/></label>
        <label>Statement CSV (reference,amount[,date] per line — kept private)<textarea className="form-input" name="statementCsv" rows={4} placeholder={'KBZ1234567,150000,2026-11-02\nWV987654,45000'}/></label>
        <label>Statement total (MMK, optional)<input className="form-input" name="totalStatementAmountMmk" type="number" min={0}/></label>
        <button className="btn-primary" type="submit">Create run</button>
      </form>
    </div>
    <div className="admin-toolbar"><h2 className="text-lg font-semibold">Runs</h2></div>
    <div className="admin-panel overflow-x-auto">
      {runs.length?<table className="admin-table"><thead><tr><th>Report</th><th>Period</th><th>Matched</th><th>Unmatched</th><th>Status</th><th/></tr></thead><tbody>
        {runs.map(r=><tr key={r.id}>
          <td>{r.reportNumber}</td>
          <td className="text-xs">{r.periodStart.toISOString().slice(0,10)} → {r.periodEnd.toISOString().slice(0,10)}</td>
          <td className="text-emerald-300">{formatNumber(r.matchedCount,lang)} · {formatMmk(r.matchedAmountMmk,lang)}</td>
          <td className="text-rose-300">{formatNumber(r.unmatchedCount,lang)} · {formatMmk(r.unmatchedAmountMmk,lang)}</td>
          <td><StatusBadge status={r.status}/></td>
          <td><a className="text-xs text-violet-300 underline" href={`/admin/billing/reconciliation?report=${r.id}`}>Open</a></td>
        </tr>)}
      </tbody></table>:<div className="admin-empty">No reconciliation runs yet.</div>}
    </div>
    {selected&&<div className="billing-drawer">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">{selected.reportNumber}</h2><p className="text-xs text-slate-400">Imported by {selected.importer.name} · {formatDateTime(selected.createdAt,lang)}</p></div>
        <StatusBadge status={selected.status}/>
      </div>
      <div className="admin-panel mt-4 overflow-x-auto">
        <table className="admin-table"><thead><tr><th>Kind</th><th>Reference</th><th>Amount</th><th>Status</th><th>Note</th><th/></tr></thead><tbody>
          {selected.items.map(item=><tr key={item.id}>
            <td>{item.kind.replaceAll('_',' ').toLowerCase()}</td>
            <td className="font-mono text-xs">{item.reference}</td>
            <td>{formatMmk(item.amountMmk,lang)}</td>
            <td><StatusBadge status={item.status}/></td>
            <td className="max-w-md text-xs text-slate-400">{item.note}</td>
            <td>{selected.status==='OPEN'&&item.status!=='RESOLVED'?<form action={resolveReconciliationItemAction} className="flex items-center gap-2">
              <input type="hidden" name="itemId" value={item.id}/>
              <select name="status" className="form-input !w-auto text-xs"><option value="MATCHED">Mark matched</option><option value="INVESTIGATING">Investigating</option><option value="RESOLVED">Resolved</option></select>
              <button className="text-xs text-violet-300 underline" type="submit">Save</button>
            </form>:null}</td>
          </tr>)}
          {selected.items.length===0&&<tr><td colSpan={6} className="admin-empty">No items.</td></tr>}
        </tbody></table>
      </div>
      {selected.status==='OPEN'?<form action={closeReconciliationAction} className="admin-form">
        <input type="hidden" name="reportId" value={selected.id}/>
        <label>Closing notes<input className="form-input" name="notes"/></label>
        <button className="btn-outline" type="submit">Close run</button>
      </form>:<p className="mt-3 text-xs text-slate-500">Closed by {selected.closer?.name} · {formatDateTime(selected.closedAt,lang)}</p>}
    </div>}
  </main>;
}
