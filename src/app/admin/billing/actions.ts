'use server';
/**
 * Phase 18 — admin billing server actions.
 *
 * Authorization matrix (least privilege):
 * - Finance (requireFinanceAdmin): payment verification, refund review/completion,
 *   reconciliation, billing sweep. SUPER_ADMIN included.
 * - Platform (requireBillingPlatformAdmin): plan versions, subscription lifecycle
 *   admin actions, invoice voiding.
 * Separation of duties is enforced inside the service layer; every decision is
 * audited there. Self-approval is rejected by assertNotSelfApproval.
 */
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { csrfCheck } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireFinanceAdmin, requireBillingPlatformAdmin } from '@/lib/billing/rbac';
import { reviewPaymentAttempt } from '@/lib/billing/payments';
import { voidInvoice, issueInvoice } from '@/lib/billing/invoices';
import { createPlanVersion } from '@/lib/billing/plans';
import { cancelSubscription } from '@/lib/billing/subscriptions';
import { reviewCreditNote, completeCreditNote } from '@/lib/billing/refunds';
import { createReconciliationRun, resolveReconciliationItem, closeReconciliationRun } from '@/lib/billing/reconciliation';
import { runBillingSweep } from '@/lib/billing/jobs';

export type BillingAdminState = { error?: string; success?: string };

export async function reviewPaymentAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const reviewer = await requireFinanceAdmin();
  const attemptId = String(formData.get('attemptId') || '');
  const decision = String(formData.get('decision') || '') === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  try {
    await reviewPaymentAttempt({
      attemptId,
      reviewer,
      decision,
      rejectionReason: String(formData.get('rejectionReason') || '') || undefined,
      verificationNote: String(formData.get('verificationNote') || '') || undefined,
    });
  } catch (error) {
    revalidatePath('/admin/billing/payments');
    throw error instanceof Error ? error : new Error('Review failed.');
  }
  revalidatePath('/admin/billing/payments');
  revalidatePath('/admin/billing');
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const admin = await requireBillingPlatformAdmin();
  await voidInvoice(String(formData.get('invoiceId') || ''), admin.id);
  revalidatePath('/admin/billing/invoices');
}

export async function issueInvoiceAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const admin = await requireBillingPlatformAdmin();
  await issueInvoice(String(formData.get('invoiceId') || ''), admin.id);
  revalidatePath('/admin/billing/invoices');
}

export async function createPlanVersionAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const admin = await requireBillingPlatformAdmin();
  const features = String(formData.get('features') || '').split(',').map((f) => f.trim()).filter(Boolean);
  await createPlanVersion({
    planId: String(formData.get('planId') || ''),
    monthlyPriceMmk: Number(formData.get('monthlyPriceMmk') || 0),
    annualPriceMmk: Number(formData.get('annualPriceMmk') || 0),
    includedSeats: Number(formData.get('includedSeats') || 1),
    maxSeats: formData.get('maxSeats') ? Number(formData.get('maxSeats')) : null,
    websitesLimit: formData.get('websitesLimit') ? Number(formData.get('websitesLimit')) : null,
    customDomainsLimit: formData.get('customDomainsLimit') ? Number(formData.get('customDomainsLimit')) : null,
    storageMb: formData.get('storageMb') ? Number(formData.get('storageMb')) : null,
    bandwidthMb: formData.get('bandwidthMb') ? Number(formData.get('bandwidthMb')) : null,
    monthlyAiCredits: Number(formData.get('monthlyAiCredits') || 0),
    monthlyApiRequests: formData.get('monthlyApiRequests') ? Number(formData.get('monthlyApiRequests')) : null,
    features,
    notes: String(formData.get('notes') || '') || undefined,
    activate: String(formData.get('activate') || '') === 'true',
  });
  revalidatePath('/admin/billing/plans');
}

export async function adminCancelSubscriptionAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const admin = await requireBillingPlatformAdmin();
  await cancelSubscription(String(formData.get('subscriptionId') || ''), admin.id, String(formData.get('immediate') || '') === 'true');
  revalidatePath('/admin/billing/subscriptions');
}

export async function reviewCreditNoteAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const reviewer = await requireFinanceAdmin();
  await reviewCreditNote({
    creditNoteId: String(formData.get('creditNoteId') || ''),
    reviewer,
    decision: String(formData.get('decision') || '') === 'APPROVED' ? 'APPROVED' : 'REJECTED',
    reviewNote: String(formData.get('reviewNote') || '') || undefined,
  });
  revalidatePath('/admin/billing/refunds');
}

export async function completeCreditNoteAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const financeUser = await requireFinanceAdmin();
  await completeCreditNote({
    creditNoteId: String(formData.get('creditNoteId') || ''),
    financeUser,
    payoutMethod: String(formData.get('payoutMethod') || ''),
    payoutReference: String(formData.get('payoutReference') || ''),
    reverseEntitlement: String(formData.get('reverseEntitlement') || '') === 'true',
  });
  revalidatePath('/admin/billing/refunds');
}

export async function createReconciliationAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const financeUser = await requireFinanceAdmin();
  const csvField = String(formData.get('statementCsv') || '');
  const statementCsv = typeof csvField === 'string' && csvField.trim() ? csvField : undefined;
  const periodStart = new Date(String(formData.get('periodStart') || '') || Date.now());
  const periodEnd = new Date(String(formData.get('periodEnd') || '') || Date.now());
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) throw new Error('Invalid reconciliation period.');
  await createReconciliationRun({
    financeUser,
    periodStart,
    periodEnd,
    statementName: String(formData.get('statementName') || '') || undefined,
    statementCsv,
    totalStatementAmountMmk: formData.get('totalStatementAmountMmk') ? Number(formData.get('totalStatementAmountMmk')) : undefined,
  });
  revalidatePath('/admin/billing/reconciliation');
}

export async function resolveReconciliationItemAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const financeUser = await requireFinanceAdmin();
  const statusRaw = String(formData.get('status') || 'RESOLVED');
  const status = ['MATCHED', 'INVESTIGATING', 'RESOLVED'].includes(statusRaw) ? statusRaw as 'MATCHED' | 'INVESTIGATING' | 'RESOLVED' : 'RESOLVED';
  await resolveReconciliationItem(String(formData.get('itemId') || ''), financeUser, status, String(formData.get('note') || '') || undefined);
  revalidatePath('/admin/billing/reconciliation');
}

export async function closeReconciliationAction(formData: FormData): Promise<void> {
  await csrfCheck();
  const financeUser = await requireFinanceAdmin();
  await closeReconciliationRun(String(formData.get('reportId') || ''), financeUser, String(formData.get('notes') || '') || undefined);
  revalidatePath('/admin/billing/reconciliation');
}

export async function runBillingSweepAction(): Promise<void> {
  await csrfCheck();
  const actor = await requireFinanceAdmin();
  await runBillingSweep(actor);
  revalidatePath('/admin/billing');
  revalidatePath('/admin/billing/subscriptions');
  revalidatePath('/admin/billing/invoices');
}

/** Guard used by proof downloads: only finance/platform viewers may fetch payment proofs. */
export async function requireProofViewer() {
  return requireAdmin(['SUPER_ADMIN', 'FINANCE_ADMIN']);
}
