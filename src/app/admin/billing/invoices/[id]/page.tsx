import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoleCode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireBillingViewer } from '@/lib/billing/rbac';
import { voidInvoiceAction } from '../../actions';
import { ErrorBanner, PageHeader, StatusBadge, fmtDate, fmtMmk } from '../../parts';

export const dynamic = 'force-dynamic';

export default async function BillingInvoiceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const viewer = await requireBillingViewer();
  const { id } = await params;
  const sp = await searchParams;

  const invoice = await prisma.billingInvoice.findUnique({
    where: { id },
    include: {
      account: { select: { name: true, billingKey: true } },
      subscription: { select: { id: true, plan: { select: { name: true, code: true } }, cycle: true } },
      lines: true,
      paymentAttempts: {
        orderBy: { submittedAt: 'desc' },
        include: { reviewer: { select: { name: true, email: true } } },
      },
      ledgerEntries: { orderBy: { postedAt: 'asc' } },
    },
  });
  if (!invoice) notFound();

  const isPlatformAdmin = viewer.role.code === RoleCode.SUPER_ADMIN || viewer.role.code === RoleCode.ADMIN;
  const voidable = invoice.amountPaidMmk === 0 && ['DRAFT', 'ISSUED', 'OVERDUE'].includes(invoice.status);
  const outstanding = Math.max(0, invoice.totalMmk - invoice.amountPaidMmk);

  return (
    <main className="admin-content">
      <Link className="text-sm text-slate-400" href="/admin/billing/invoices">
        ← Invoices
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageHeader eyebrow="INVOICE DETAIL" title={invoice.invoiceNumber} note={`${invoice.account.name} · ${invoice.account.billingKey}`} />
        </div>
        <StatusBadge value={invoice.status} />
      </div>
      <ErrorBanner message={sp.error} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="admin-panel">
          <h2 className="font-semibold">Lines</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit amount</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.lineType.replaceAll('_', ' ')}</td>
                    <td>{line.description}</td>
                    <td>{line.quantity}</td>
                    <td>{fmtMmk(line.unitAmountMmk)}</td>
                    <td>{fmtMmk(line.amountMmk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-6 space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd>{fmtMmk(invoice.subtotalMmk)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Discount</dt>
              <dd>−{fmtMmk(invoice.discountMmk)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax</dt>
              <dd>{fmtMmk(invoice.taxMmk)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd>{fmtMmk(invoice.totalMmk)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Paid</dt>
              <dd>{fmtMmk(invoice.amountPaidMmk)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-amber-200">
              <dt>Outstanding</dt>
              <dd>{fmtMmk(outstanding)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Period {fmtDate(invoice.periodStart)} – {fmtDate(invoice.periodEnd)} · due {fmtDate(invoice.dueAt)} · issued {fmtDate(invoice.issuedAt)}
            {invoice.subscription ? ` · ${invoice.subscription.plan.name} (${invoice.subscription.plan.code}, ${invoice.subscription.cycle})` : ''}
          </p>
        </section>

        <div className="space-y-6">
          <details className="admin-panel">
            <summary className="cursor-pointer font-semibold">Issued snapshot (JSON)</summary>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-white/[.03] p-4 text-xs leading-5 text-slate-300">
              {invoice.snapshot ? JSON.stringify(invoice.snapshot, null, 2) : 'No snapshot — the invoice has not been issued yet.'}
            </pre>
          </details>

          {voidable && isPlatformAdmin ? (
            <form action={voidInvoiceAction} className="admin-panel space-y-3">
              <h2 className="font-semibold">Void invoice</h2>
              <p className="text-xs leading-6 text-slate-400">
                Voiding is permanent and audited. Only unpaid invoices can be voided — use a credit note for anything paid.
              </p>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button className="btn-outline">Void this invoice</button>
            </form>
          ) : null}
        </div>
      </div>

      <section className="admin-panel mt-6 overflow-x-auto">
        <h2 className="font-semibold">Payment attempts</h2>
        <p className="mt-2 text-xs text-slate-500">Screenshots are records for the reviewer, never proof of payment. Proofs are shown as “on file” only.</p>
        <table className="admin-table mt-5">
          <thead>
            <tr>
              <th>Status</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Proof</th>
              <th>Reviewer</th>
              <th>Verification</th>
            </tr>
          </thead>
          <tbody>
            {invoice.paymentAttempts.length ? (
              invoice.paymentAttempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>
                    <StatusBadge value={attempt.status} />
                  </td>
                  <td>{attempt.method}</td>
                  <td className="font-mono">{attempt.transactionReference}</td>
                  <td>{fmtMmk(attempt.amountMmk)}</td>
                  <td>{attempt.proofStorageKey ? 'Proof on file' : '—'}</td>
                  <td>{attempt.reviewer?.email ?? '—'}</td>
                  <td>
                    {attempt.verificationNote ? <span className="block">{attempt.verificationNote}</span> : null}
                    {attempt.rejectionReason ? <span className="block text-rose-300">Rejected: {attempt.rejectionReason}</span> : null}
                    {!attempt.verificationNote && !attempt.rejectionReason ? '—' : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="admin-empty">No payment attempts for this invoice.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="admin-panel mt-6 overflow-x-auto">
        <h2 className="font-semibold">Ledger entries</h2>
        <table className="admin-table mt-5">
          <thead>
            <tr>
              <th>Entry type</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>Posted</th>
              <th>Memo</th>
            </tr>
          </thead>
          <tbody>
            {invoice.ledgerEntries.length ? (
              invoice.ledgerEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.entryType.replaceAll('_', ' ')}</td>
                  <td>{entry.direction}</td>
                  <td>{fmtMmk(entry.amountMmk)}</td>
                  <td>{fmtDate(entry.postedAt)}</td>
                  <td>{entry.memo ?? '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  <div className="admin-empty">No ledger postings yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
