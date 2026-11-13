import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireFinanceAdmin } from '@/lib/billing/rbac';
import { closeReconciliationAction, resolveReconciliationItemAction } from '../../actions';
import { ErrorBanner, KpiCard, PageHeader, StatusBadge, fmtDate, fmtMmk } from '../../parts';

export const dynamic = 'force-dynamic';

const RESOLVE_STATUSES = ['MATCHED', 'INVESTIGATING', 'RESOLVED'] as const;

export default async function ReconciliationRun({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireFinanceAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const report = await prisma.billingReconciliation.findUnique({
    where: { id },
    include: { items: { orderBy: { createdAt: 'asc' } }, importer: { select: { email: true } }, closer: { select: { email: true } } },
  });
  if (!report) notFound();

  const open = report.status === 'OPEN';
  const duplicates = report.items.filter((item) => item.note?.includes('DUPLICATE_REFERENCE')).length;

  return (
    <main className="admin-content">
      <Link className="text-sm text-slate-400" href="/admin/billing/reconciliation">
        ← Reconciliation
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageHeader
            eyebrow="RECONCILIATION RUN"
            title={report.reportNumber}
            note={`Period ${fmtDate(report.periodStart)} – ${fmtDate(report.periodEnd)} · opened by ${report.importer.email} on ${fmtDate(report.openedAt)}${report.statementName ? ` · statement: ${report.statementName}` : ''}`}
          />
        </div>
        <StatusBadge value={report.status} />
      </div>
      <ErrorBanner message={sp.error} />

      <div className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/5 px-4 py-3 text-xs leading-6 text-rose-200">
        Never auto-approve unmatched payments — every unmatched or investigating item needs a documented human decision before this run can be closed.
      </div>

      <div className="admin-stat-grid mt-6">
        <KpiCard label="Matched items" value={report.matchedCount} accent />
        <KpiCard label="Matched amount" value={fmtMmk(report.matchedAmountMmk)} />
        <KpiCard label="Unmatched items" value={report.unmatchedCount} />
        <KpiCard label="Unmatched amount" value={fmtMmk(report.unmatchedAmountMmk)} />
        <KpiCard label="Duplicate references" value={duplicates} />
        <KpiCard label="Statement total" value={report.totalStatementAmountMmk !== null ? fmtMmk(report.totalStatementAmountMmk) : '—'} />
      </div>

      <section className="admin-panel mt-6 overflow-x-auto">
        <h2 className="font-semibold">Items</h2>
        <table className="admin-table mt-5">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Note</th>
              {open ? <th>Resolve</th> : null}
            </tr>
          </thead>
          <tbody>
            {report.items.length ? (
              report.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.kind.replaceAll('_', ' ')}</td>
                  <td className="font-mono">{item.reference}</td>
                  <td>{fmtMmk(item.amountMmk)}</td>
                  <td>
                    <StatusBadge value={item.status} />
                  </td>
                  <td className="max-w-[260px] text-xs text-slate-400">{item.note ?? '—'}</td>
                  {open ? (
                    <td className="min-w-[260px]">
                      <form action={resolveReconciliationItemAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="reportId" value={report.id} />
                        <select className="form-input text-xs" name="status" defaultValue={item.status === 'UNMATCHED' ? 'INVESTIGATING' : item.status}>
                          {RESOLVE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <input className="form-input text-xs" name="note" placeholder="Decision note" />
                        <button className="btn-outline">Save</button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={open ? 6 : 5}>
                  <div className="admin-empty">No items in this run. Re-run matching if this looks wrong.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {open ? (
        <form action={closeReconciliationAction} className="admin-panel mt-6 max-w-2xl space-y-4">
          <h2 className="font-semibold">Close run</h2>
          <p className="text-xs leading-6 text-slate-400">
            Closing records the summary and freezes the run. Unmatched items can stay open with a note — they are never auto-approved.
          </p>
          <input type="hidden" name="reportId" value={report.id} />
          <label>
            Closing notes
            <textarea className="form-input min-h-20" name="notes" placeholder="Summary of the period and how open items were handled" />
          </label>
          <button className="btn-primary">Close reconciliation run</button>
        </form>
      ) : (
        <section className="admin-panel mt-6 max-w-2xl">
          <h2 className="font-semibold">Closed</h2>
          <p className="mt-3 text-sm text-slate-400">
            Closed {fmtDate(report.closedAt)}
            {report.closer ? ` by ${report.closer.email}` : ''}.
          </p>
          {report.notes ? <p className="mt-2 text-xs text-slate-500">{report.notes}</p> : null}
        </section>
      )}
    </main>
  );
}
