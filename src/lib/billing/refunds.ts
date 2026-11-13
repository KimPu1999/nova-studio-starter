/**
 * Phase 18 — refunds and credit notes.
 *
 * Lifecycle: REQUESTED -> APPROVED -> ISSUED -> COMPLETED (or REJECTED/VOID).
 * A credit note is COMPLETED only after the reviewer confirms the actual payout
 * (method + reference + confirmation) — approval alone never marks money as
 * returned. Entitlement and credit reversals follow documented policy:
 * subscription invoices revoke entitlements on COMPLETED, credit reversals
 * never push a wallet negative (only what remains is reversed).
 */
import { prisma } from '@/lib/prisma';
import { assertNotSelfApproval, requireFinanceAdmin } from './rbac';
import { requireBillingAccountAccess } from './accounts';
import { billingAudit, billingNotify } from './audit';
import { postLedgerEntry } from './ledger';
import { assertIntMmk } from './constants';
import type { Prisma, User } from '@prisma/client';

export type CreditNoteClient = Prisma.TransactionClient;

export function composeCreditNoteNumber(date: Date, token: string): string {
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `CN-${ym}-${token}`;
}

/** Eligible refundable amount for an invoice: paid minus already refunded. */
export function refundableAmountFor(invoice: { totalMmk: number; amountPaidMmk: number }, refundedAlready: number): number {
  assertIntMmk(refundedAlready, 'Refunded amount');
  return Math.max(0, invoice.amountPaidMmk - refundedAlready);
}

/**
 * Sum of refund amounts that already reserve or consume the paid balance
 * (APPROVED reserves at review, ISSUED/COMPLETED consume it). Used for the
 * cumulative refund cap that prevents over-refunding an invoice.
 */
export function committedRefundedTotal(notes: { status: string; amountMmk: number }[]): number {
  return notes.filter((n) => ['APPROVED', 'ISSUED', 'COMPLETED'].includes(n.status)).reduce((sum, n) => sum + n.amountMmk, 0);
}

export interface RequestCreditNoteInput {
  invoiceId: string;
  user: User;
  amountMmk?: number;
  reason: string;
  type?: 'REFUND' | 'CREDIT_ADJUSTMENT';
  idempotencyKey: string;
}

/** Customer (or finance) requests a credit note. Validates eligibility only. */
export async function requestCreditNote(input: RequestCreditNoteInput) {
  const invoice = await prisma.billingInvoice.findUnique({ where: { id: input.invoiceId }, include: { account: true, creditNotes: true } });
  if (!invoice) throw new Error('Invoice not found.');
  await requireBillingAccountAccess(invoice.accountId, input.user);
  if (!['PAID', 'PARTIALLY_PAID'].includes(invoice.status)) throw new Error('Only paid invoices are eligible for refunds.');
  const refundedAlready = invoice.creditNotes.filter((c) => ['APPROVED', 'ISSUED', 'COMPLETED'].includes(c.status)).reduce((sum, c) => sum + c.amountMmk, 0);
  const eligible = refundableAmountFor(invoice, refundedAlready);
  if (eligible <= 0) throw new Error('This invoice has no refundable balance remaining.');
  const amountMmk = input.amountMmk ?? eligible;
  assertIntMmk(amountMmk, 'Refund amount');
  if (amountMmk > eligible) throw new Error(`Refund cannot exceed the eligible amount of ${eligible.toLocaleString()} MMK.`);
  if (!input.reason || input.reason.trim().length < 10) throw new Error('Explain the refund reason (at least 10 characters).');
  const existing = await prisma.billingCreditNote.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const now = new Date();
  const creditNote = await prisma.billingCreditNote.create({
    data: {
      creditNoteNumber: composeCreditNoteNumber(now, input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-6).padEnd(6, '0')),
      invoiceId: invoice.id,
      accountId: invoice.accountId,
      type: input.type ?? 'REFUND',
      status: 'REQUESTED',
      amountMmk,
      currency: invoice.currency,
      reason: input.reason.trim(),
      requestedById: input.user.id,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await billingAudit({ actorId: input.user.id, accountId: invoice.accountId, entityType: 'BillingCreditNote', entityId: creditNote.id, action: 'REQUEST_CREDIT_NOTE', after: { invoiceId: invoice.id, amountMmk } });
  return creditNote;
}

export interface ReviewCreditNoteInput {
  creditNoteId: string;
  reviewer: User;
  decision: 'APPROVED' | 'REJECTED';
  reviewNote?: string;
}

/** Finance review: approval reserves the amount but issues nothing yet. */
export async function reviewCreditNote(input: ReviewCreditNoteInput) {
  const creditNote = await prisma.billingCreditNote.findUnique({ where: { id: input.creditNoteId }, include: { invoice: true, account: true } });
  if (!creditNote) throw new Error('Credit note not found.');
  assertNotSelfApproval(input.reviewer.id, creditNote.requestedById, 'this refund request');
  if (creditNote.status !== 'REQUESTED') throw new Error('This credit note has already been reviewed.');
  if (input.decision === 'REJECTED' && !input.reviewNote?.trim()) throw new Error('A rejection note is required.');
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.billingCreditNote.updateMany({
      where: { id: creditNote.id, status: 'REQUESTED' },
      data: { status: input.decision, reviewedById: input.reviewer.id, reviewedAt: new Date(), reviewNote: input.reviewNote },
    });
    if (claimed.count !== 1) throw new Error('Credit note was already reviewed.');
    if (input.decision === 'APPROVED') {
      // Re-validate the cumulative refund cap under the claim: concurrent
      // approvals of two credit notes for the same invoice must not both
      // reserve more than was actually paid.
      if (creditNote.invoice) {
        const siblings = await tx.billingCreditNote.findMany({ where: { invoiceId: creditNote.invoiceId, id: { not: creditNote.id }, status: { in: ['APPROVED', 'ISSUED', 'COMPLETED'] } }, select: { amountMmk: true, status: true } });
        const eligible = refundableAmountFor(creditNote.invoice, committedRefundedTotal(siblings));
        if (creditNote.amountMmk > eligible) {
          throw new Error(`Approval would exceed the refundable balance (${eligible.toLocaleString()} MMK remaining). Reject or void this credit note instead.`);
        }
      }
      await tx.billingCreditNote.update({ where: { id: creditNote.id }, data: { status: 'ISSUED', issuedAt: new Date() } });
    }
  });
  await billingAudit({ actorId: input.reviewer.id, accountId: creditNote.accountId, entityType: 'BillingCreditNote', entityId: creditNote.id, action: `REVIEW_${input.decision}`, after: { amountMmk: creditNote.amountMmk, note: input.reviewNote } });
  await billingNotify(creditNote.requestedById, input.decision === 'APPROVED' ? 'BILLING_REFUND_APPROVED' : 'BILLING_REFUND_REJECTED', input.decision === 'APPROVED' ? 'Refund approved' : 'Refund rejected', input.decision === 'APPROVED' ? `Refund of ${creditNote.amountMmk.toLocaleString()} MMK was approved. It completes once the payout is confirmed.` : `Refund rejected: ${input.reviewNote}`, '/billing/invoices');
  return prisma.billingCreditNote.findUniqueOrThrow({ where: { id: creditNote.id } });
}

export interface CompleteCreditNoteInput {
  creditNoteId: string;
  financeUser: User;
  payoutMethod: string;
  payoutReference: string;
  reverseEntitlement?: boolean;
}

/**
 * Confirms the actual payout: ISSUED -> COMPLETED, posts the REFUND ledger
 * entry (DEBIT), optionally reverses the subscription entitlements and AI
 * credits per policy. Reversal of credits never makes a balance negative.
 */
export async function completeCreditNote(input: CompleteCreditNoteInput) {
  const creditNote = await prisma.billingCreditNote.findUnique({ where: { id: input.creditNoteId }, include: { invoice: true, account: true } });
  if (!creditNote) throw new Error('Credit note not found.');
  assertNotSelfApproval(input.financeUser.id, creditNote.requestedById, 'this refund payout');
  if (creditNote.status !== 'ISSUED') throw new Error('Only issued credit notes can be completed.');
  if (!input.payoutMethod.trim() || input.payoutReference.trim().length < 4) {
    throw new Error('Record the payout method and transaction reference before completing the refund.');
  }
  await prisma.$transaction(async (tx) => {
    // Re-validate the cumulative refund cap under the claim: concurrent
    // completions of two ISSUED credit notes for the same invoice must never
    // refund more than the invoice actually received.
    if (creditNote.invoice) {
      const completed = await tx.billingCreditNote.findMany({ where: { invoiceId: creditNote.invoiceId, id: { not: creditNote.id }, status: 'COMPLETED' }, select: { amountMmk: true, status: true } });
      const eligible = refundableAmountFor(creditNote.invoice, committedRefundedTotal(completed));
      if (creditNote.amountMmk > eligible) {
        throw new Error(`Completion would exceed the refundable balance (${eligible.toLocaleString()} MMK remaining). Void this credit note instead.`);
      }
    }
    const claimed = await tx.billingCreditNote.updateMany({
      where: { id: creditNote.id, status: 'ISSUED' },
      data: { status: 'COMPLETED', payoutMethod: input.payoutMethod, payoutReference: input.payoutReference.trim(), payoutConfirmedAt: new Date(), payoutConfirmedById: input.financeUser.id },
    });
    if (claimed.count !== 1) throw new Error('Credit note was already completed.');
    await postLedgerEntry(tx, {
      entryType: 'REFUND',
      direction: 'DEBIT',
      amountMmk: creditNote.amountMmk,
      accountId: creditNote.accountId,
      invoiceId: creditNote.invoiceId ?? undefined,
      creditNoteId: creditNote.id,
      sourceType: 'BillingCreditNote',
      sourceId: creditNote.id,
      memo: `Refund completed for ${creditNote.creditNoteNumber}`,
      idempotencyKey: `refund:${creditNote.id}`,
      postedById: input.financeUser.id,
    });
    // Reverse entitlements for subscription invoices (documented policy).
    if (input.reverseEntitlement && creditNote.invoice?.subscriptionId && creditNote.invoice.amountPaidMmk <= creditNote.amountMmk) {
      const subscription = await tx.billingSubscription.findUnique({ where: { id: creditNote.invoice.subscriptionId } });
      if (subscription && subscription.status !== 'CANCELLED') {
        await tx.billingSubscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), endedAt: new Date(), slotKey: null } });
        await tx.billingEntitlement.updateMany({ where: { accountId: subscription.accountId, sourceSubscriptionId: subscription.id }, data: { enabled: false } });
      }
    }
    // Reverse purchased credits without pushing the wallet negative.
    if (creditNote.invoice?.purpose === 'CREDIT_PACKAGE') {
      const granted = await tx.aiCreditLedger.findUnique({ where: { idempotencyKey: `billing:credits:${creditNote.invoiceId}` } });
      if (granted && granted.amount > 0) {
        const wallet = await tx.aiCreditWallet.findUnique({ where: { userId: creditNote.account.ownerUserId } });
        if (wallet) {
          const reversal = Math.min(granted.amount, wallet.balance);
          if (reversal > 0) {
            await tx.aiCreditWallet.update({ where: { id: wallet.id }, data: { balance: { decrement: reversal } } });
            await tx.aiCreditLedger.create({ data: { walletId: wallet.id, userId: wallet.userId, type: 'CREDIT_REFUND', amount: -reversal, idempotencyKey: `billing:credit-reversal:${creditNote.id}`, referenceType: 'BillingCreditNote', referenceId: creditNote.id, note: `Reversal for ${creditNote.creditNoteNumber}` } });
            await tx.billingCreditNote.update({ where: { id: creditNote.id }, data: { creditsReversed: reversal } });
          }
        }
      }
    }
  });
  await billingAudit({ actorId: input.financeUser.id, accountId: creditNote.accountId, entityType: 'BillingCreditNote', entityId: creditNote.id, action: 'COMPLETE_REFUND', after: { payoutMethod: input.payoutMethod, payoutReference: input.payoutReference } });
  await billingNotify(creditNote.requestedById, 'BILLING_REFUND_COMPLETED', 'Refund completed', `${creditNote.amountMmk.toLocaleString()} MMK was paid out. Reference: ${input.payoutReference}`, '/billing/invoices');
}

/** Reconciles refund totals for an invoice (used by reports/reconciliation). */
export async function refundedTotalForInvoice(invoiceId: string): Promise<number> {
  const rows = await prisma.billingCreditNote.findMany({ where: { invoiceId, status: 'COMPLETED' }, select: { amountMmk: true } });
  return rows.reduce((sum, r) => sum + r.amountMmk, 0);
}
