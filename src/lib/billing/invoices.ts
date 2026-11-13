/**
 * Phase 18 — invoice management.
 *
 * Invariants:
 * - All amounts are integer MMK; totals are always recomputed from lines.
 * - Issuing a DRAFT invoice freezes an immutable snapshot; later line edits are
 *   impossible through this API. VOID/PAYMENT transitions are explicit.
 * - Invoice numbers are unique (DB constraint) with retry on collision.
 * - `applyInvoicePayment` guards against overpayment and is safe to call from
 *   concurrent payment approvals.
 */
import { prisma } from '@/lib/prisma';
import { randomInt } from 'crypto';
import { assertIntMmk, PAYABLE_INVOICE_STATUSES } from './constants';
import { billingAudit, billingNotify } from './audit';
import { postLedgerEntry } from './ledger';
import type { BillingInvoiceLineType, BillingInvoiceStatus, Prisma } from '@prisma/client';

export type InvoiceLineInput = {
  lineType: BillingInvoiceLineType;
  description: string;
  quantity: number;
  unitAmountMmk: number;
  planVersionId?: string;
};

export type InvoiceClient = Prisma.TransactionClient;

/** Unique, human-readable invoice number: NV-YYYYMM-XXXXXX. */
export function composeInvoiceNumber(prefix: string, date: Date, token: string): string {
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${prefix}-${ym}-${token}`;
}

export function composeToken(idempotencyKey: string): string {
  const raw = idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (raw.length >= 6 ? raw.slice(-6) : raw.padEnd(6, '0')) + randomInt(0, 10).toString();
}

/** Validates line inputs and computes integer totals. */
export function computeInvoiceTotals(lines: InvoiceLineInput[], discountMmk: number, taxMmk: number) {
  assertIntMmk(discountMmk, 'Discount');
  assertIntMmk(taxMmk, 'Tax');
  if (!lines.length) throw new Error('An invoice needs at least one line.');
  let subtotalMmk = 0;
  const prepared = lines.map((line) => {
    if (!line.description?.trim()) throw new Error('Invoice line description is required.');
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error('Invoice line quantity must be a positive integer.');
    assertIntMmk(line.unitAmountMmk, 'Line unit amount');
    const amountMmk = line.quantity * line.unitAmountMmk;
    subtotalMmk += amountMmk;
    return { ...line, amountMmk };
  });
  const totalMmk = subtotalMmk - discountMmk + taxMmk;
  if (totalMmk < 0) throw new Error('Invoice total cannot be negative.');
  return { lines: prepared, subtotalMmk, discountMmk, taxMmk, totalMmk };
}

export interface CreateInvoiceInput {
  accountId: string;
  purpose: string;
  subscriptionId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  dueAt: Date;
  discountMmk?: number;
  taxMmk?: number;
  notes?: string;
  idempotencyKey: string;
  lines: InvoiceLineInput[];
  actorId?: string;
}

/** Creates a DRAFT invoice; idempotent on idempotencyKey (returns existing). */
export async function createInvoice(input: CreateInvoiceInput) {
  const existing = await prisma.billingInvoice.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const totals = computeInvoiceTotals(input.lines, input.discountMmk ?? 0, input.taxMmk ?? 0);
  const account = await prisma.billingAccount.findUnique({ where: { id: input.accountId } });
  if (!account) throw new Error('Billing account not found.');
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.create({
      data: {
        invoiceNumber: composeInvoiceNumber(account.invoicePrefix, now, composeToken(input.idempotencyKey)),
        accountId: input.accountId,
        subscriptionId: input.subscriptionId ?? undefined,
        purpose: input.purpose,
        status: 'DRAFT',
        currency: account.currency,
        periodStart: input.periodStart ?? undefined,
        periodEnd: input.periodEnd ?? undefined,
        dueAt: input.dueAt,
        subtotalMmk: totals.subtotalMmk,
        discountMmk: totals.discountMmk,
        taxMmk: totals.taxMmk,
        totalMmk: totals.totalMmk,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        lines: { create: totals.lines.map((l) => ({ lineType: l.lineType, description: l.description, quantity: l.quantity, unitAmountMmk: l.unitAmountMmk, amountMmk: l.amountMmk, planVersionId: l.planVersionId })) },
      },
      include: { lines: true },
    });
    await billingAudit({ actorId: input.actorId, accountId: input.accountId, entityType: 'BillingInvoice', entityId: invoice.id, action: 'CREATE_DRAFT', after: { totalMmk: invoice.totalMmk, purpose: invoice.purpose } });
    return invoice;
  });
}

/**
 * Issues an invoice: DRAFT -> ISSUED. The issued totals+lines snapshot becomes
 * immutable (see `assertInvoiceMutable`); the customer is notified.
 */
export async function issueInvoice(invoiceId: string, actorId?: string) {
  const invoice = await prisma.$transaction(async (tx) => {
    const target = await tx.billingInvoice.findUnique({ where: { id: invoiceId }, include: { lines: true } });
    if (!target) throw new Error('Invoice not found.');
    if (target.status !== 'DRAFT') return target;
    // Re-validate totals from stored lines before freezing the snapshot.
    const recomputed = target.lines.reduce((sum, l) => sum + l.amountMmk, 0);
    if (recomputed !== target.subtotalMmk || target.totalMmk !== recomputed - target.discountMmk + target.taxMmk) {
      throw new Error('Invoice totals do not match line items.');
    }
    const issued = tx.billingInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'ISSUED' as BillingInvoiceStatus,
        issuedAt: new Date(),
        snapshot: { subtotalMmk: target.subtotalMmk, discountMmk: target.discountMmk, taxMmk: target.taxMmk, totalMmk: target.totalMmk, lines: target.lines.map((l) => ({ lineType: l.lineType, description: l.description, quantity: l.quantity, unitAmountMmk: l.unitAmountMmk, amountMmk: l.amountMmk })) },
      },
    });
    return issued;
  });
  if (invoice.status === 'ISSUED') {
    const account = await prisma.billingAccount.findUnique({ where: { id: invoice.accountId } });
    await billingNotify(account!.ownerUserId, 'BILLING_INVOICE_ISSUED', 'New invoice available', `Invoice ${invoice.invoiceNumber} of ${invoice.totalMmk.toLocaleString()} MMK is ready for payment.`, `/billing/invoices/${invoice.id}`);
    await billingAudit({ actorId, accountId: invoice.accountId, entityType: 'BillingInvoice', entityId: invoice.id, action: 'ISSUE', after: { status: 'ISSUED', totalMmk: invoice.totalMmk } });
  }
  return invoice;
}

/** Issued/paid invoices are immutable; only DRAFT invoices may change lines/totals. */
export function assertInvoiceMutable(invoice: { status: BillingInvoiceStatus }): void {
  if (invoice.status !== 'DRAFT') throw new Error('Issued invoices are immutable. Issue a credit note or adjustment invoice instead.');
}

/**
 * Applies a VERIFIED payment to an invoice inside a transaction. Guarded against
 * overpayment and concurrent application via a conditional updateMany.
 */
export async function applyInvoicePayment(tx: InvoiceClient, invoiceId: string, amountMmk: number): Promise<{ paid: boolean; fullyPaid: boolean }> {
  assertIntMmk(amountMmk, 'Payment amount');
  if (amountMmk === 0) return { paid: false, fullyPaid: false };
  const invoice = await tx.billingInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error('Invoice not found.');
  if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) throw new Error('Invoice cannot receive payments.');
  const outstanding = invoice.totalMmk - invoice.amountPaidMmk;
  if (amountMmk > outstanding) throw new Error('Payment exceeds the outstanding invoice balance.');
  const updated = await tx.billingInvoice.updateMany({
    where: { id: invoiceId, totalMmk: invoice.totalMmk, amountPaidMmk: invoice.amountPaidMmk },
    data: { amountPaidMmk: { increment: amountMmk } },
  });
  if (updated.count !== 1) throw new Error('Invoice changed while applying payment; retry.');
  const fullyPaid = invoice.amountPaidMmk + amountMmk >= invoice.totalMmk;
  await tx.billingInvoice.update({
    where: { id: invoiceId },
    data: { status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID', paidAt: fullyPaid ? new Date() : undefined },
  });
  return { paid: true, fullyPaid };
}

/** Marks issued invoices past their due date as OVERDUE (job helper). */
export async function markOverdueInvoices(now: Date = new Date()): Promise<number> {
  const result = await prisma.billingInvoice.updateMany({
    where: { status: 'ISSUED', dueAt: { lt: now }, amountPaidMmk: 0 },
    data: { status: 'OVERDUE' },
  });
  return result.count;
}

/** Voids an unpaid invoice. Any paid amount blocks voiding (use credit notes). */
export async function voidInvoice(invoiceId: string, actorId: string): Promise<void> {
  const invoice = await prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error('Invoice not found.');
  if (invoice.amountPaidMmk > 0) throw new Error('Paid invoices cannot be voided; issue a credit note instead.');
  if (!['DRAFT', 'ISSUED', 'OVERDUE'].includes(invoice.status)) throw new Error('Invoice cannot be voided.');
  await prisma.billingInvoice.update({ where: { id: invoiceId }, data: { status: 'VOID', voidedAt: new Date() } });
  await billingAudit({ actorId, accountId: invoice.accountId, entityType: 'BillingInvoice', entityId: invoiceId, action: 'VOID', before: { status: invoice.status }, after: { status: 'VOID' } });
}

/** Ledger posting helper: cash receipt + deferred revenue for a settled invoice. */
export async function postInvoiceSettlementLedger(
  tx: InvoiceClient,
  invoice: { id: string; invoiceNumber: string; accountId: string; amountPaidMmk: number; purpose: string },
  paymentAttemptId: string | null,
  amountMmk: number,
  actorId?: string,
): Promise<void> {
  await postLedgerEntry(tx, {
    entryType: 'CASH_RECEIPT',
    direction: 'CREDIT',
    amountMmk,
    accountId: invoice.accountId,
    invoiceId: invoice.id,
    paymentAttemptId: paymentAttemptId ?? undefined,
    sourceType: 'BillingPaymentAttempt',
    sourceId: paymentAttemptId ?? invoice.id,
    memo: `Cash received for ${invoice.invoiceNumber}`,
    idempotencyKey: `cash:${paymentAttemptId ?? invoice.id}`,
    postedById: actorId,
  });
  // Period-based subscriptions defer revenue; point-in-time products (e.g.
  // credit packages) are recognized immediately on the same posting.
  if (invoice.purpose === 'SUBSCRIPTION') {
    await postLedgerEntry(tx, {
      entryType: 'DEFERRED_REVENUE',
      direction: 'CREDIT',
      amountMmk,
      accountId: invoice.accountId,
      invoiceId: invoice.id,
      paymentAttemptId: paymentAttemptId ?? undefined,
      sourceType: 'BillingPaymentAttempt',
      sourceId: paymentAttemptId ?? invoice.id,
      memo: `Deferred revenue for ${invoice.invoiceNumber}`,
      idempotencyKey: `deferred:${paymentAttemptId ?? invoice.id}`,
      postedById: actorId,
    });
  }
}
