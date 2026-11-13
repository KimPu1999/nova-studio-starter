/**
 * Phase 18 — manual payment submission and verification (KBZPay / WavePay / bank).
 *
 * Hard rules:
 * - Uploaded screenshots/proofs are records for the REVIEWER, never proof of
 *   payment. Approval requires the finance reviewer to confirm the transfer in
 *   the actual wallet/bank transaction history.
 * - Transaction references are globally unique per method (DB constraint), so
 *   the same reference cannot pay two invoices.
 * - Entitlements (subscription activation, credit grants, plan changes) are
 *   granted ONLY inside the verified-approval transaction, exactly once.
 * - Separation of duties: a user can never review their own submission.
 * - Every reviewer decision is audited.
 */
import { prisma } from '@/lib/prisma';
import { assertIntMmk, PAYABLE_INVOICE_STATUSES, advancePeriod } from './constants';
import { requireBillingAccountAccess, getOrCreatePersonalBillingAccount } from './accounts';
import { applyInvoicePayment, postInvoiceSettlementLedger } from './invoices';
import { activateSubscriptionFromVerifiedPayment, applyPlanChangeFromVerifiedPayment } from './subscriptions';
import { assertNotSelfApproval, requireFinanceAdmin } from './rbac';
import { billingAudit, billingNotify } from './audit';
import { putPrivateFile } from '@/lib/private-storage';
import type { BillingPaymentMethod, Prisma, User } from '@prisma/client';
import type { LedgerClient } from './ledger';

export interface SubmitPaymentInput {
  invoiceId: string;
  user: User;
  method: BillingPaymentMethod;
  amountMmk: number;
  transactionReference: string;
  proof?: File | null;
  idempotencyKey: string;
}

/** Normalizes a transaction reference for deduplication. */
export function normalizeReference(reference: string): string {
  return reference.trim().replace(/\s+/g, '').toUpperCase();
}

/** Customer submits a payment attempt for review. Screenshots are stored privately. */
export async function submitPaymentAttempt(input: SubmitPaymentInput) {
  const invoice = await prisma.billingInvoice.findUnique({ where: { id: input.invoiceId }, include: { account: true } });
  if (!invoice) throw new Error('Invoice not found.');
  if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) throw new Error('This invoice cannot receive payments.');
  await requireBillingAccountAccess(invoice.accountId, input.user);
  assertIntMmk(input.amountMmk, 'Payment amount');
  const outstanding = invoice.totalMmk - invoice.amountPaidMmk;
  if (input.amountMmk <= 0 || input.amountMmk > outstanding) {
    throw new Error(`Amount must be between 1 and ${outstanding.toLocaleString()} MMK.`);
  }
  const reference = normalizeReference(input.transactionReference);
  if (reference.length < 4) throw new Error('Enter the transaction reference from your payment app or bank.');

  let proofStorageKey: string | undefined;
  let proofMimeType: string | undefined;
  if (input.proof && input.proof.size > 0) {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (!allowed.includes(input.proof.type)) throw new Error('Payment proof must be PNG, JPEG, or PDF.');
    if (input.proof.size > 8 * 1024 * 1024) throw new Error('Payment proof must be under 8 MB.');
    const stored = await putPrivateFile(Buffer.from(await input.proof.arrayBuffer()), input.proof.type.split('/')[1] || 'bin');
    proofStorageKey = stored;
    proofMimeType = input.proof.type;
  }

  const existing = await prisma.billingPaymentAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const attempt = await prisma.billingPaymentAttempt.create({
    data: {
      invoiceId: invoice.id,
      accountId: invoice.accountId,
      method: input.method,
      amountMmk: input.amountMmk,
      currency: invoice.currency,
      transactionReference: reference,
      proofStorageKey,
      proofMimeType,
      status: 'PENDING_REVIEW',
      submittedById: input.user.id,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await billingAudit({ actorId: input.user.id, accountId: invoice.accountId, entityType: 'BillingPaymentAttempt', entityId: attempt.id, action: 'SUBMIT_PAYMENT_REVIEW', after: { invoiceId: invoice.id, amountMmk: input.amountMmk, method: input.method } });
  return attempt;
}

export interface ReviewPaymentInput {
  attemptId: string;
  reviewer: User;
  decision: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  verificationNote?: string;
}

/**
 * Finance reviewer decision. On APPROVED, in ONE transaction:
 * claim the attempt -> apply the payment to the invoice -> post ledger entries
 * -> activate/renew the subscription or grant credits or apply a plan change.
 * Any failure rolls the whole transition back; retrying is safe.
 */
export async function reviewPaymentAttempt(input: ReviewPaymentInput) {
  if (input.decision === 'REJECTED' && !input.rejectionReason?.trim()) {
    throw new Error('A rejection reason is required.');
  }
  const attempt = await prisma.billingPaymentAttempt.findUnique({ where: { id: input.attemptId }, include: { invoice: true, account: true } });
  if (!attempt) throw new Error('Payment attempt not found.');
  assertNotSelfApproval(input.reviewer.id, attempt.submittedById, 'this payment submission');
  if (attempt.status !== 'PENDING_REVIEW') throw new Error('This payment attempt has already been reviewed.');
  if (input.decision === 'REJECTED') {
    const rejected = await prisma.$transaction(async (tx) => {
      const claimed = await tx.billingPaymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING_REVIEW' }, data: { status: 'REJECTED', reviewedById: input.reviewer.id, reviewedAt: new Date(), rejectionReason: input.rejectionReason } });
      if (claimed.count !== 1) throw new Error('Payment attempt was already reviewed.');
      return tx.billingPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    });
    await billingAudit({ actorId: input.reviewer.id, accountId: attempt.accountId, entityType: 'BillingPaymentAttempt', entityId: attempt.id, action: 'REJECT_PAYMENT', after: { reason: input.rejectionReason } });
    await billingNotify(attempt.submittedById, 'BILLING_PAYMENT_REJECTED', 'Payment could not be verified', `Payment for ${attempt.invoice.invoiceNumber} was rejected: ${input.rejectionReason}`, `/billing/invoices/${attempt.invoiceId}`);
    return rejected;
  }
  if (!input.verificationNote?.trim()) {
    throw new Error('Confirm the transfer in your KBZPay/WavePay/bank statement and add a verification note.');
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.billingPaymentAttempt.updateMany({
      where: { id: attempt.id, status: 'PENDING_REVIEW' },
      data: { status: 'APPROVED', reviewedById: input.reviewer.id, reviewedAt: new Date(), verificationNote: input.verificationNote },
    });
    if (claimed.count !== 1) throw new Error('Payment attempt was already reviewed.');
    const invoice = attempt.invoice;
    const { fullyPaid } = await applyInvoicePayment(tx, invoice.id, attempt.amountMmk);
    await postInvoiceSettlementLedger(tx, { id: invoice.id, invoiceNumber: invoice.invoiceNumber, accountId: invoice.accountId, amountPaidMmk: invoice.amountPaidMmk + attempt.amountMmk, purpose: invoice.purpose }, attempt.id, attempt.amountMmk, input.reviewer.id);

    // Verified payment -> entitlements, once, inside the same transaction.
    if (invoice.purpose === 'SUBSCRIPTION' && invoice.subscriptionId) {
      await activateSubscriptionFromVerifiedPayment(tx, invoice.subscriptionId, invoice, input.reviewer.id);
    }
    if (invoice.purpose === 'CREDIT_PACKAGE') {
      await grantCreditsForVerifiedInvoice(tx as unknown as Prisma.TransactionClient, invoice.id, attempt.account.ownerUserId);
    }
    if (invoice.purpose === 'PLAN_CHANGE' && invoice.subscriptionId) {
      const meta = invoice.metadata as { targetVersionId?: string; targetPriceMmk?: number } | null;
      const targetVersionId = meta?.targetVersionId ?? null;
      if (targetVersionId) {
        const version = await tx.billingPlanVersion.findUnique({ where: { id: targetVersionId } });
        if (version) {
          await applyPlanChangeFromVerifiedPayment(tx, invoice.subscriptionId, targetVersionId, meta?.targetPriceMmk ?? version.monthlyPriceMmk, input.reviewer.id);
        }
      }
    }
    if (fullyPaid) await tx.billingInvoice.update({ where: { id: invoice.id }, data: { paidAt: new Date() } });
    return tx.billingPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  }).then(async (result) => {
    await billingAudit({ actorId: input.reviewer.id, accountId: attempt.accountId, entityType: 'BillingPaymentAttempt', entityId: attempt.id, action: 'APPROVE_PAYMENT', after: { amountMmk: attempt.amountMmk, invoiceId: attempt.invoiceId, note: input.verificationNote } });
    await billingNotify(attempt.submittedById, 'BILLING_PAYMENT_VERIFIED', 'Payment verified', `Payment for ${attempt.invoice.invoiceNumber} was verified and applied.`, attempt.invoice.subscriptionId ? '/billing/subscription' : `/billing/invoices/${attempt.invoiceId}`);
    return result;
  });
}

/** Grants purchased AI credits exactly once per invoice (reuses Phase 13 wallet). */
export async function grantCreditsForVerifiedInvoice(tx: Prisma.TransactionClient, invoiceId: string, ownerUserId: string) {
  const granted = await tx.aiCreditLedger.findUnique({ where: { idempotencyKey: `billing:credits:${invoiceId}` } });
  if (granted) return;
  const line = await tx.billingInvoiceLine.findFirst({ where: { invoiceId, lineType: 'AI_CREDITS' } });
  if (!line) return;
  const meta = await tx.billingInvoice.findUnique({ where: { id: invoiceId }, select: { metadata: true, purpose: true } });
  const credits = Number((meta as unknown as { metadata?: { credits?: number } } | null)?.metadata?.credits ?? 0) || line.quantity;
  const wallet = await tx.aiCreditWallet.upsert({ where: { userId: ownerUserId }, update: {}, create: { userId: ownerUserId } });
  await tx.aiCreditLedger.create({
    data: { walletId: wallet.id, userId: ownerUserId, type: 'CREDIT_PURCHASE', amount: credits, idempotencyKey: `billing:credits:${invoiceId}`, referenceType: 'BillingInvoice', referenceId: invoiceId, note: 'Verified credit package purchase' },
  });
  await tx.aiCreditWallet.update({ where: { id: wallet.id }, data: { balance: { increment: credits } } });
}

/**
 * Admin issues an invoice on behalf of a billing account (e.g. AI credit
 * packages, custom scopes). Creates DRAFT -> ISSUED invoice with lines.
 */
export async function ensurePersonalBillingAccountFor(userId: string) {
  return getOrCreatePersonalBillingAccount(userId);
}

/** Cancels a pending attempt (submitter or finance). */
export async function cancelPaymentAttempt(attemptId: string, user: User) {
  const attempt = await prisma.billingPaymentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error('Payment attempt not found.');
  if (attempt.status !== 'PENDING_REVIEW') throw new Error('Only pending attempts can be cancelled.');
  if (attempt.submittedById !== user.id) await requireFinanceAdmin();
  await prisma.billingPaymentAttempt.update({ where: { id: attemptId }, data: { status: 'CANCELLED' } });
  await billingAudit({ actorId: user.id, accountId: attempt.accountId, entityType: 'BillingPaymentAttempt', entityId: attemptId, action: 'CANCEL_PAYMENT_ATTEMPT' });
}

export type { BillingPaymentMethod };
